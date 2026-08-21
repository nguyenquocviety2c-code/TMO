/**
 * Memory Tiers API — Phase 4
 *
 * POST /api/memory/tiers — Run tier transitions manually
 *   Body: { agentId: string, action?: 'promote' | 'archive' | 'cleanup' | 'all' }
 *   Default action: 'all' (run all 3 transitions)
 *
 * GET /api/memory/tiers?agentId=xxx — Get memory tier statistics
 *   Returns counts per tier (WorkingMemory, AgentMemory, MemoryArchive)
 *
 * Phase 4 of design doc.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  promoteWorkingMemoryToWarm,
  archiveColdMemories,
  cleanupExpiredArchives,
  runTierTransitions,
} from '@/lib/memory-tiers'

export const dynamic = 'force-dynamic'

// ==================== POST — RUN TRANSITIONS ====================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const agentId = body.agentId
    const action = body.action || 'all'

    if (!agentId) {
      return NextResponse.json(
        { error: 'agentId is required' },
        { status: 400 }
      )
    }

    const validActions = ['promote', 'archive', 'cleanup', 'all']
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: `action must be one of: ${validActions.join(', ')}` },
        { status: 400 }
      )
    }

    const startTime = Date.now()
    let result: {
      promoted?: number
      archived?: number
      cleaned?: number
      errors?: string[]
    } = {}

    if (action === 'all') {
      const r = await runTierTransitions(agentId)
      result = {
        promoted: r.promoted,
        archived: r.archived,
        cleaned: r.cleaned,
        errors: r.errors,
      }
    } else if (action === 'promote') {
      const r = await promoteWorkingMemoryToWarm(agentId)
      result = { promoted: r.promoted, errors: r.errors }
    } else if (action === 'archive') {
      const r = await archiveColdMemories(agentId)
      result = { archived: r.archived, errors: r.errors }
    } else if (action === 'cleanup') {
      const r = await cleanupExpiredArchives()
      result = { cleaned: r.cleaned, errors: r.errors }
    }

    const durationMs = Date.now() - startTime
    console.log(`[MemoryTiers API] action=${action} agentId=${agentId} duration=${durationMs}ms`)

    return NextResponse.json({
      success: true,
      action,
      agentId,
      ...result,
      durationMs,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[MemoryTiers API] POST error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ==================== GET — TIER STATISTICS ====================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agentId')

    if (!agentId) {
      return NextResponse.json(
        { error: 'agentId is required' },
        { status: 400 }
      )
    }

    // Count records per tier
    const [workingCount, warmCount, coldCount, archiveCount] = await Promise.all([
      db.workingMemory.count({ where: { agentId } }),
      db.agentMemory.count({ where: { agentId, tier: 'warm', isActive: true } }),
      db.agentMemory.count({ where: { agentId, tier: 'cold' } }),
      db.memoryArchive.count({ where: { agentId } }),
    ])

    // Count by domain (Phase 4)
    const [userDomain, workDomain, metaDomain] = await Promise.all([
      db.agentMemory.count({ where: { agentId, domain: 'user', isActive: true } }),
      db.agentMemory.count({ where: { agentId, domain: 'work', isActive: true } }),
      db.agentMemory.count({ where: { agentId, domain: 'meta', isActive: true } }),
    ])

    // Count decayed (isActive=false) memories awaiting archive
    const decayedCount = await db.agentMemory.count({
      where: { agentId, isActive: false, tier: 'warm' },
    })

    // Count expired archives awaiting cleanup
    const expiredArchives = await db.memoryArchive.count({
      where: { expiresAt: { lt: new Date() } },
    })

    return NextResponse.json({
      agentId,
      tiers: {
        hot: workingCount,           // WorkingMemory
        warm: warmCount,             // AgentMemory (active, tier=warm)
        coldInactive: coldCount,     // AgentMemory (tier=cold)
        coldArchive: archiveCount,    // MemoryArchive
      },
      domains: {
        user: userDomain,
        work: workDomain,
        meta: metaDomain,
      },
      pending: {
        decayed: decayedCount,        // ready for archive
        expiredArchives,              // ready for cleanup
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[MemoryTiers API] GET error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
