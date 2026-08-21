/**
 * Voice Transcribe API — Vosk Vietnamese ASR + LLM correction
 *
 * POST /api/voice/transcribe
 *   Body: FormData { audio: Blob (audio/webm or audio/wav) }
 *   Returns: { text: string, success: boolean, error?: string }
 *
 * Uses Vosk (offline Vietnamese model) for ASR + LLM correction.
 * Vosk returns Vietnamese text (native) but may be imperfect.
 * LLM correction polishes the text + detects "Xin hết".
 */

import { NextRequest, NextResponse } from 'next/server'
import { writeFileSync, readFile, unlinkSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

const MAX_AUDIO_SIZE = 25 * 1024 * 1024
const VOSK_URL = 'http://127.0.0.1:3004'

export async function POST(request: NextRequest) {
  let tempPath: string | null = null

  try {
    const formData = await request.formData()
    const audioFile = formData.get('audio') as File | null

    if (!audioFile) {
      return NextResponse.json(
        { success: false, error: 'No audio file provided' },
        { status: 400 }
      )
    }

    if (audioFile.size > MAX_AUDIO_SIZE) {
      return NextResponse.json(
        { success: false, error: 'Audio too large' },
        { status: 413 }
      )
    }

    // Save audio to temp file
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer())
    const ext = audioFile.name?.endsWith('.wav') ? '.wav' : '.webm'
    tempPath = join(tmpdir(), `voice-input-${randomUUID()}${ext}`)
    writeFileSync(tempPath, audioBuffer)

    console.log(`[Voice] Transcribing: ${audioFile.size} bytes, type: ${audioFile.type}`)

    // Step 1: Vosk ASR (offline Vietnamese model)
    const audioBase64 = audioBuffer.toString('base64')

    let rawText = ''
    try {
      const voskRes = await fetch(`${VOSK_URL}/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio_base64: audioBase64 }),
        signal: AbortSignal.timeout(30000),
      })

      if (!voskRes.ok) {
        throw new Error(`Vosk error: ${voskRes.status}`)
      }

      const voskData = await voskRes.json()
      rawText = voskData.text || ''
      console.log(`[Voice] Vosk raw: "${rawText.slice(0, 100)}"`)
    } catch (voskErr) {
      console.warn('[Voice] Vosk failed, trying z-ai fallback:', voskErr instanceof Error ? voskErr.message : String(voskErr))
      // Fallback: z-ai ASR + LLM correction
      rawText = await fallbackZaiASR(tempPath)
    }

    if (!rawText.trim()) {
      return NextResponse.json({
        success: true,
        text: '',
        message: 'No speech detected',
      })
    }

    // Step 2: LLM correction — polish Vietnamese text + detect "Xin hết"
    let correctedText = rawText
    try {
      correctedText = await correctVietnamese(rawText)
      console.log(`[Voice] Corrected: "${correctedText.slice(0, 100)}"`)
    } catch (corrErr) {
      console.warn('[Voice] LLM correction failed, using raw:', corrErr instanceof Error ? corrErr.message : String(corrErr))
    }

    return NextResponse.json({
      success: true,
      text: correctedText.trim(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Voice] Transcribe error:', msg)
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    )
  } finally {
    if (tempPath && existsSync(tempPath)) {
      try { unlinkSync(tempPath) } catch {}
    }
  }
}

/**
 * Fallback: z-ai ASR (cloud, may have rate limits)
 */
async function fallbackZaiASR(audioPath: string): Promise<string> {
  const { execSync } = await import('child_process')
  const outputPath = audioPath.replace(/\.[^.]+$/, '-result.json')

  execSync(`z-ai asr --file "${audioPath}" --output "${outputPath}"`, {
    timeout: 30000,
    stdio: 'pipe',
  })

  const resultStr = await new Promise<string>((resolve, reject) => {
    readFile(outputPath, 'utf-8', (err, data) => {
      if (err) reject(err)
      else resolve(data)
    })
  })

  try { unlinkSync(outputPath) } catch {}

  const parsed = JSON.parse(resultStr)
  return parsed.text || ''
}

/**
 * Use LLM to polish Vietnamese ASR output + detect "Xin hết".
 * Vosk returns Vietnamese but may have errors (small model).
 */
async function correctVietnamese(rawText: string): Promise<string> {
  const ZAI = (await import('z-ai-web-dev-sdk')).default
  const zai = await ZAI.create()

  const result = await zai.chat.completions.create({
    model: 'glm-4-flash',
    messages: [
      {
        role: 'system',
        content: `You are a Vietnamese speech recognition corrector. The user spoke in Vietnamese. The ASR system returned imperfect Vietnamese text. Your job is to correct and polish it.

Rules:
1. The raw text is Vietnamese (may have spelling errors from small ASR model)
2. Correct obvious phonetic errors:
   - "thói quỳ" → "tôi muốn" (phonetic similarity)
   - "xin đồ họa" → "xin hết" (phonetic similarity)
   - "quỳ" → "muốn" or similar
3. Output ONLY the corrected Vietnamese text — no explanations
4. Preserve "Xin hết" if it was likely spoken (end-of-speech signal)
5. Keep technical terms (Docker, React, Python) as-is
6. Common Vietnamese phrases:
   - "Tôi muốn hỏi về..." = I want to ask about...
   - "Xin chào" = Hello
   - "Xin hết" = End signal (I'm done speaking)
7. If the text ends with something that sounds like "Xin hết" (e.g. "xin đồ họa", "xin đồ"), correct it to "Xin hết"`
      },
      {
        role: 'user',
        content: `Raw ASR output: "${rawText}"\n\nCorrected Vietnamese:`
      }
    ],
    temperature: 0.1,
    max_tokens: 200,
  })

  return result.choices?.[0]?.message?.content?.trim() || rawText
}
