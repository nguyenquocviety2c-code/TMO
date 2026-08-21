/**
 * Voice Transcribe API — Speech-to-Text with Vietnamese correction
 *
 * POST /api/voice/transcribe
 *   Body: FormData { audio: Blob (audio/webm or audio/wav) }
 *   Returns: { text: string, success: boolean, error?: string }
 *
 * Uses z-ai-web-dev-sdk ASR + LLM correction for Vietnamese.
 * The ASR API sometimes returns Chinese text instead of Vietnamese (phonetic
 * misrecognition). We use LLM to reconstruct the original Vietnamese speech.
 *
 * Also detects "Xin hết" command (and Chinese equivalent) for Live Mode.
 */

import { NextRequest, NextResponse } from 'next/server'
import { writeFileSync, readFile, unlinkSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { execSync } from 'child_process'

export const dynamic = 'force-dynamic'

// Max audio file size: 25 MB
const MAX_AUDIO_SIZE = 25 * 1024 * 1024

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

    // Step 1: ASR (raw — may return Chinese due to phonetic misrecognition)
    const outputPath = tempPath.replace(ext, '-result.json')

    try {
      execSync(`z-ai asr --file "${tempPath}" --output "${outputPath}"`, {
        timeout: 30000,
        stdio: 'pipe',
      })

      const resultStr = await new Promise<string>((resolve, reject) => {
        readFile(outputPath, 'utf-8', (err, data) => {
          if (err) reject(err)
          else resolve(data)
        })
      })

      const parsed = JSON.parse(resultStr)
      let rawText = parsed.text || parsed.transcript || parsed.content || ''

      // Cleanup raw ASR temp files
      try { unlinkSync(outputPath) } catch {}

      if (!rawText.trim()) {
        return NextResponse.json({
          success: true,
          text: '',
          message: 'No speech detected',
        })
      }

      console.log(`[Voice] ASR raw: "${rawText.slice(0, 100)}"`)

      // Step 2: LLM correction — always run (ASR often returns garbled text for Vietnamese)
      // The ASR API misrecognizes Vietnamese as Chinese/English phonetic sounds
      let correctedText = rawText

      try {
        correctedText = await correctVietnamese(rawText)
        console.log(`[Voice] Corrected: "${correctedText.slice(0, 100)}"`)
      } catch (corrErr) {
        console.warn('[Voice] LLM correction failed, using raw:', corrErr instanceof Error ? corrErr.message : String(corrErr))
        // Keep raw text — better than nothing
      }

      return NextResponse.json({
        success: true,
        text: correctedText.trim(),
      })
    } catch (asrErr) {
      const msg = asrErr instanceof Error ? asrErr.message : String(asrErr)
      console.error('[Voice] ASR failed:', msg)
      return NextResponse.json(
        { success: false, error: `Speech recognition failed: ${msg}` },
        { status: 500 }
      )
    }
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
 * Use LLM to reconstruct Vietnamese speech from garbled ASR output.
 * The ASR API may return Chinese characters, English phonetic, or gibberish
 * instead of Vietnamese. LLM corrects this using phonetic pattern matching.
 */
async function correctVietnamese(rawText: string): Promise<string> {
  const ZAI = (await import('z-ai-web-dev-sdk')).default
  const zai = await ZAI.create()

  const result = await zai.chat.completions.create({
    model: 'gemini-2.0-flash',
    messages: [
      {
        role: 'system',
        content: `You are a Vietnamese speech recognition corrector. The user spoke in Vietnamese but ASR returned garbled text (Chinese characters, English phonetic, or gibberish).

The user is using a Live Voice chat system. They speak Vietnamese and end their speech with "Xin hết" (meaning "end of speech" — literally "request end").

Reconstruct the original Vietnamese text. Rules:
1. Chinese characters are phonetic misrecognition of Vietnamese:
   - 他看 = "Tôi muốn" or similar sounding
   - 康康 = "càng" or repeated sound
2. Garbled English words are phonetic matches to Vietnamese sounds:
   - "tug weight" = "Tôi muốn" (I want)
   - "tugway" = "hỏi" (ask) or similar
   - "shin" = "xinh" or "hết"
   - "Texan" = "Xin" (in "Xin chào" / "Xin hết")
   - "Chen" = "chào"
   - "Say" = "say" or "hết"
   - "tug" = "Tôi" or "hết"
3. Output ONLY the corrected Vietnamese text — no explanations
4. Include "Xin hết" at the end if it was likely spoken
5. Keep technical terms (Docker, React, Python) as-is
6. If the speech seems complete and ends with a signal, add "Xin hết"
7. Common Vietnamese phrases:
   - "Tôi muốn hỏi về..." = I want to ask about...
   - "Xin chào" = Hello
   - "Xin hết" = End signal
   - "Docker là gì" = What is Docker`
      },
      {
        role: 'user',
        content: `Raw ASR output: "${rawText}"\n\nReconstruct the original Vietnamese speech:`
      }
    ],
    temperature: 0.1,
    max_tokens: 200,
  })

  const corrected = result.choices?.[0]?.message?.content?.trim() || ''
  return corrected
}
