/**
 * Voice Transcribe API — Speech-to-Text
 *
 * POST /api/voice/transcribe
 *   Body: FormData { audio: Blob (audio/webm or audio/wav) }
 *   Returns: { text: string, success: boolean, error?: string }
 *
 * Uses z-ai-web-dev-sdk ASR (speech recognition) — built into sandbox, no API key needed.
 * Supports: WAV, MP3, WebM audio formats.
 */

import { NextRequest, NextResponse } from 'next/server'
import { writeFileSync, readFile, unlinkSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { execSync } from 'child_process'

export const dynamic = 'force-dynamic'

// Max audio file size: 25 MB (5 min recording at 8kbps)
const MAX_AUDIO_SIZE = 25 * 1024 * 1024

export async function POST(request: NextRequest) {
  let tempPath: string | null = null

  try {
    const formData = await request.formData()
    const audioFile = formData.get('audio') as File | null

    if (!audioFile) {
      return NextResponse.json(
        { success: false, error: 'No audio file provided. Use field name "audio" in FormData.' },
        { status: 400 }
      )
    }

    if (audioFile.size > MAX_AUDIO_SIZE) {
      return NextResponse.json(
        { success: false, error: `Audio too large (${(audioFile.size / 1024 / 1024).toFixed(1)} MB). Max: 25 MB` },
        { status: 413 }
      )
    }

    // Save audio to temp file
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer())
    const ext = audioFile.name?.endsWith('.wav') ? '.wav' : '.webm'
    tempPath = join(tmpdir(), `voice-input-${randomUUID()}${ext}`)
    writeFileSync(tempPath, audioBuffer)

    console.log(`[Voice] Transcribing audio: ${audioFile.size} bytes, type: ${audioFile.type}`)

    // Use z-ai CLI for ASR
    // z-ai asr --file <path> --output <output.json>
    const outputPath = tempPath.replace(ext, '-result.json')

    try {
      execSync(`z-ai asr --file "${tempPath}" --output "${outputPath}"`, {
        timeout: 30000,
        stdio: 'pipe',
      })

      // Read the result
      const result = await new Promise<string>((resolve, reject) => {
        readFile(outputPath, 'utf-8', (err, data) => {
          if (err) reject(err)
          else resolve(data)
        })
      })

      // Parse the JSON result
      const parsed = JSON.parse(result)
      const text = parsed.text || parsed.transcript || parsed.content || ''

      // Cleanup
      try { unlinkSync(outputPath) } catch {}

      if (!text.trim()) {
        return NextResponse.json({
          success: true,
          text: '',
          message: 'No speech detected in audio',
        })
      }

      console.log(`[Voice] Transcribed: "${text.slice(0, 100)}..."`)
      return NextResponse.json({
        success: true,
        text: text.trim(),
      })
    } catch (asrErr) {
      const msg = asrErr instanceof Error ? asrErr.message : String(asrErr)
      console.error('[Voice] ASR CLI failed:', msg)
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
    // Cleanup temp file
    if (tempPath && existsSync(tempPath)) {
      try { unlinkSync(tempPath) } catch {}
    }
  }
}
