import { NextResponse } from 'next/server'
import { resumeOpenCodeSession } from '@/lib/opencode'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * POST /api/opencode/sessions/resume
 * Resume a paused OpenCode session
 * Body: { sessionId: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { sessionId } = body

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    }

    const success = await resumeOpenCodeSession(sessionId)

    // Also update SQLite cache regardless of server result
    try {
      await db.openCodeSession.updateMany({
        where: { sessionId },
        data: { status: 'active' },
      })
    } catch {
      // Non-critical
    }

    if (success) {
      return NextResponse.json({ message: 'Session resumed', sessionId })
    }

    return NextResponse.json({ error: 'Failed to resume session — server may be offline', sessionId }, { status: 503 })
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to resume session',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}
