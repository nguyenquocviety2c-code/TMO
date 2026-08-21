/**
 * Voice List API — Get available TTS voices
 *
 * GET /api/voice/voices
 *   Returns: { voices: [{ id, name, description }], default: string }
 *
 * Lists all available z-ai TTS voices for the voice selector dropdown.
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const VOICES = [
  {
    id: 'tongtong',
    name: 'Tong Tong',
    description: 'Giọng trung tính (mặc định) — nam nữ cân bằng',
    gender: 'neutral',
  },
  {
    id: 'male',
    name: 'Male',
    description: 'Giọng nam — trầm, rõ ràng',
    gender: 'male',
  },
  {
    id: 'female',
    name: 'Female',
    description: 'Giọng nữ — cao, tự nhiên',
    gender: 'female',
  },
]

export async function GET() {
  return NextResponse.json({
    voices: VOICES,
    default: 'tongtong',
    speedRange: { min: 0.5, max: 2.0, default: 1.0 },
    maxTextLength: 1000,
    note: 'z-ai SDK TTS — built into sandbox, no API key needed. For long text, auto-splits into chunks.',
  })
}
