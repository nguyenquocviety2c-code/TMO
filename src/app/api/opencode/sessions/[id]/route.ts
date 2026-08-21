import { NextResponse } from 'next/server'
import { deleteOpenCodeSession } from '@/lib/opencode'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/opencode/sessions/[id]
 * Delete an OpenCode session by session ID (path param)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const sessionId = decodeURIComponent(id)

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    }

    // Delete from OpenCode server
    await deleteOpenCodeSession(sessionId)

    // Delete from SQLite
    try {
      await db.openCodeSession.deleteMany({
        where: { sessionId },
      })
    } catch {
      // Non-critical
    }

    return NextResponse.json({ message: 'Session deleted', sessionId })
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to delete session',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}
