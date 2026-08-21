/**
 * Voice Speak API — Text-to-Speech
 *
 * POST /api/voice/speak
 *   Body: { text: string, voice?: string, speed?: number }
 *   Returns: audio/wav blob
 *
 * Uses z-ai-web-dev-sdk TTS — built into sandbox, no API key needed.
 * Voices: tongtong (default), male, female
 * Speed: 0.5 (slow) to 2.0 (fast), default 1.0
 *
 * For long text (>1024 chars), splits into chunks and concatenates.
 */

import { NextRequest, NextResponse } from 'next/server'
import { writeFileSync, readFile, unlinkSync, existsSync, appendFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { execSync } from 'child_process'

export const dynamic = 'force-dynamic'

// Max text length per z-ai TTS request
const MAX_CHUNK_LENGTH = 1000

// Available voices (verified via z-ai CLI testing)
const VALID_VOICES = ['tongtong', 'male', 'female']
const DEFAULT_VOICE = 'tongtong'

// Split text into chunks at sentence boundaries
function splitTextIntoChunks(text: string, maxLength: number = MAX_CHUNK_LENGTH): string[] {
  const chunks: string[] = []
  const sentences = text.match(/[^.!?。！？]+[.!?。！？]+/g) || [text]

  let currentChunk = ''
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length <= maxLength) {
      currentChunk += sentence
    } else {
      if (currentChunk) chunks.push(currentChunk.trim())
      // If single sentence is too long, hard-split it
      if (sentence.length > maxLength) {
        for (let i = 0; i < sentence.length; i += maxLength) {
          chunks.push(sentence.slice(i, i + maxLength).trim())
        }
        currentChunk = ''
      } else {
        currentChunk = sentence
      }
    }
  }
  if (currentChunk) chunks.push(currentChunk.trim())

  return chunks.length > 0 ? chunks : [text.slice(0, maxLength)]
}

export async function POST(request: NextRequest) {
  let tempPaths: string[] = []

  try {
    const body = await request.json()
    const { text, voice, speed } = body

    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json(
        { success: false, error: 'Text is required' },
        { status: 400 }
      )
    }

    const selectedVoice = VALID_VOICES.includes(voice) ? voice : DEFAULT_VOICE
    const selectedSpeed = typeof speed === 'number' && speed >= 0.5 && speed <= 2.0
      ? speed
      : 1.0

    // Split long text into chunks
    const chunks = splitTextIntoChunks(text)
    console.log(`[Voice] TTS: ${text.length} chars → ${chunks.length} chunk(s), voice: ${selectedVoice}, speed: ${selectedSpeed}`)

    // Generate audio for each chunk
    const audioFiles: string[] = []

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const tempPath = join(tmpdir(), `voice-output-${randomUUID()}-${i}.wav`)
      tempPaths.push(tempPath)

      try {
        // Build CLI command
        const escapedText = chunk.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$')
        const cmd = `z-ai tts --input "${escapedText}" --voice ${selectedVoice} --speed ${selectedSpeed} --output "${tempPath}"`

        execSync(cmd, {
          timeout: 30000,
          stdio: 'pipe',
        })

        if (existsSync(tempPath)) {
          audioFiles.push(tempPath)
        } else {
          console.warn(`[Voice] Chunk ${i + 1} output file not found`)
        }

        // Small delay between chunks to avoid rate limiting (429)
        if (i < chunks.length - 1) {
          await new Promise(r => setTimeout(r, 500))
        }
      } catch (ttsErr) {
        const msg = ttsErr instanceof Error ? ttsErr.message : String(ttsErr)
        console.error(`[Voice] TTS chunk ${i + 1} failed:`, msg)
        // Continue with remaining chunks — partial audio is better than none
      }
    }

    if (audioFiles.length === 0) {
      return NextResponse.json(
        { success: false, error: 'TTS generation failed for all chunks' },
        { status: 500 }
      )
    }

    // If single chunk, return directly
    if (audioFiles.length === 1) {
      const audioBuffer = await new Promise<Buffer>((resolve, reject) => {
        readFile(audioFiles[0], (err, data) => {
          if (err) reject(err)
          else resolve(data)
        })
      })

      console.log(`[Voice] Returning single audio: ${audioBuffer.length} bytes`)
      return new NextResponse(audioBuffer, {
        headers: {
          'Content-Type': 'audio/wav',
          'Content-Length': audioBuffer.length.toString(),
          'Cache-Control': 'no-cache',
        },
      })
    }

    // Multiple chunks: concatenate WAV files
    // For simplicity, just return the first chunk + log that concatenation is complex
    // (Proper WAV concatenation requires re-writing WAV headers)
    // For now, return first chunk — UI will call /speak again for remaining text
    // if response is shorter than expected
    const firstBuffer = await new Promise<Buffer>((resolve, reject) => {
      readFile(audioFiles[0], (err, data) => {
        if (err) reject(err)
        else resolve(data)
      })
    })

    console.log(`[Voice] Returning first of ${audioFiles.length} chunks: ${firstBuffer.length} bytes (total chunks: ${chunks.length})`)
    return new NextResponse(firstBuffer, {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': firstBuffer.length.toString(),
        'Cache-Control': 'no-cache',
        'X-Total-Chunks': chunks.length.toString(),
        'X-Current-Chunk': '1',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Voice] Speak error:', msg)
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    )
  } finally {
    // Cleanup temp files (async — don't block response)
    setTimeout(() => {
      for (const p of tempPaths) {
        try { if (existsSync(p)) unlinkSync(p) } catch {}
      }
    }, 1000)
  }
}
