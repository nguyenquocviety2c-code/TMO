import { NextResponse } from 'next/server'
import { getTerminalOutput } from '@/lib/opencode'

export const dynamic = 'force-dynamic'

/**
 * GET /api/opencode/terminal?sessionId=xxx
 * Get terminal output from OpenCode server
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('sessionId') || undefined

  try {
    const output = await getTerminalOutput(sessionId)
    return NextResponse.json({ ...output, source: 'opencode-server' })
  } catch {
    return NextResponse.json({
      output: [],
      message: 'OpenCode server offline',
      source: 'local-fallback',
    })
  }
}
