import { NextResponse } from 'next/server'
import { listOpenCodeSessions, createOpenCodeSession, deleteOpenCodeSession, isOpenCodeOnline } from '@/lib/opencode'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/opencode/sessions
 * List OpenCode sessions (from server + SQLite cache)
 */
export async function GET() {
  try {
    // Check server connectivity first
    const serverOnline = await isOpenCodeOnline()

    // Get sessions from OpenCode server
    const serverSessions = serverOnline ? await listOpenCodeSessions() : []

    // Also get persisted sessions from SQLite
    const dbSessions = await db.openCodeSession.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    // Merge: server sessions take priority
    const serverSessionIds = new Set(serverSessions.map(s => s.sessionId))
    const mergedSessions = [
      ...serverSessions,
      ...dbSessions.filter(s => !serverSessionIds.has(s.sessionId)).map(s => ({
        ...s,
        // Parse JSON fields stored as strings in SQLite
        filesTouched: typeof s.filesTouched === 'string' ? JSON.parse(s.filesTouched) : s.filesTouched,
        toolsUsed: typeof s.toolsUsed === 'string' ? JSON.parse(s.toolsUsed) : s.toolsUsed,
      })),
    ]

    return NextResponse.json({
      sessions: mergedSessions,
      total: mergedSessions.length,
      serverOnline,
    })
  } catch {
    // Fallback: only SQLite
    try {
      const dbSessions = await db.openCodeSession.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      return NextResponse.json({
        sessions: dbSessions.map(s => ({
          ...s,
          filesTouched: typeof s.filesTouched === 'string' ? JSON.parse(s.filesTouched) : s.filesTouched,
          toolsUsed: typeof s.toolsUsed === 'string' ? JSON.parse(s.toolsUsed) : s.toolsUsed,
        })),
        total: dbSessions.length,
        serverOnline: false,
      })
    } catch {
      return NextResponse.json({ sessions: [], total: 0, serverOnline: false })
    }
  }
}

/**
 * POST /api/opencode/sessions
 * Create a new OpenCode session
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { prompt, model, provider } = body

    if (!prompt) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
    }

    // Create on OpenCode server
    const session = await createOpenCodeSession({ prompt, model, provider })

    if (session) {
      // Also persist to SQLite
      try {
        await db.openCodeSession.create({
          data: {
            sessionId: session.sessionId,
            model: session.model,
            provider: session.provider,
            prompt: session.prompt,
            status: session.status,
            filesTouched: JSON.stringify(session.filesTouched || []),
            toolsUsed: JSON.stringify(session.toolsUsed || []),
          },
        })
      } catch {
        // SQLite write failure is non-critical
      }

      return NextResponse.json({ session, message: 'Session created' }, { status: 201 })
    }

    // Fallback: create local-only session when OpenCode server is offline
    const localSessionId = `oc-local-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
    const localSession = {
      sessionId: localSessionId,
      model: model || null,
      provider: provider || 'local',
      prompt,
      status: 'pending' as const,
      filesTouched: [],
      toolsUsed: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    try {
      await db.openCodeSession.create({
        data: {
          sessionId: localSessionId,
          model: model || null,
          provider: provider || 'local',
          prompt,
          status: 'pending',
          filesTouched: '[]',
          toolsUsed: '[]',
        },
      })
    } catch {
      // Non-critical
    }

    return NextResponse.json({
      session: localSession,
      message: 'Session created locally — OpenCode server offline. Session will be queued.',
      offline: true,
    }, { status: 201 })
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to create session',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

/**
 * DELETE /api/opencode/sessions?sessionId=xxx
 * Delete an OpenCode session
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    }

    // Delete from server
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
