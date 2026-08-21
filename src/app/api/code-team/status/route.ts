/**
 * Code Team — Workflow Session Status API
 *
 * GET /api/code-team/status?sessionId=xxx
 *   Returns current workflow session status:
 *   - Session state, current agent, completed agents, duration, etc.
 *
 * GET /api/code-team/status?list=1
 *   Lists recent workflow sessions (last 10)
 *   Useful for monitoring
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession, readWorklog, getWorklogStats } from '@/lib/code-team/worklog'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const sessionId = searchParams.get('sessionId')
  const listSessions = searchParams.get('list') === '1'

  try {
    // ===== LIST RECENT SESSIONS =====
    if (listSessions) {
      return await listRecentSessions()
    }

    // ===== SPECIFIC SESSION STATUS =====
    if (sessionId) {
      return await getSessionStatus(sessionId)
    }

    // ===== OVERVIEW =====
    return await getOverview()
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({
      status: 'error',
      error: errorMsg,
    }, { status: 500 })
  }
}

/** Get status of a specific session */
async function getSessionStatus(sessionId: string) {
  const session = await getSession(sessionId)

  if (!session) {
    return NextResponse.json({
      status: 'not_found',
      sessionId,
      message: `Session "${sessionId}" not found`,
    }, { status: 404 })
  }

  // Get worklog stats
  const stats = await getWorklogStats(sessionId)

  // Get worklog entries for timeline
  const worklogs = await readWorklog(sessionId)

  // Calculate duration
  const duration = session.currentStep === 'completed' || session.currentStep === 'failed'
    ? session.totalDuration
    : (session.createdAt ? Date.now() - new Date(session.createdAt).getTime() : 0)

  return NextResponse.json({
    status: 'ok',
    session: {
      sessionId: session.sessionId,
      routingMode: session.routingMode,
      tier: session.tier,
      score: session.score,
      currentStep: session.currentStep,
      currentAgent: session.currentAgent,
      completedAgents: session.completedAgents,
      partsDefinition: session.partsDefinition,
      totalDuration: session.totalDuration,
      duration,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    },
    stats: {
      totalEntries: stats.totalEntries,
      totalIssues: stats.totalIssues,
      criticalIssues: stats.criticalIssues,
      highIssues: stats.highIssues,
      fixedIssues: stats.fixedIssues,
      agentsCompleted: stats.agentsCompleted,
    },
    timeline: worklogs.map(wl => ({
      agentName: wl.agentName,
      position: wl.position,
      step: wl.step,
      summary: wl.summary.slice(0, 200),
      issues: wl.issues.length,
      timestamp: wl.timestamp,
    })),
  })
}

/** List recent sessions */
async function listRecentSessions() {
  const sessions = await db.codeTeamSession.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  return NextResponse.json({
    status: 'ok',
    count: sessions.length,
    sessions: sessions.map(s => ({
      sessionId: s.sessionId,
      routingMode: s.routingMode,
      tier: s.tier,
      score: s.score,
      currentStep: s.currentStep,
      currentAgent: s.currentAgent,
      completedAgents: JSON.parse(s.completedAgents) as string[],
      totalDuration: s.totalDuration,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
  })
}

/** Overview of all sessions */
async function getOverview() {
  const totalSessions = await db.codeTeamSession.count()
  const activeSessions = await db.codeTeamSession.count({
    where: { currentStep: 'running' },
  })
  const completedSessions = await db.codeTeamSession.count({
    where: { currentStep: 'completed' },
  })
  const failedSessions = await db.codeTeamSession.count({
    where: { currentStep: 'failed' },
  })

  return NextResponse.json({
    status: 'ok',
    overview: {
      totalSessions,
      activeSessions,
      completedSessions,
      failedSessions,
    },
  })
}
