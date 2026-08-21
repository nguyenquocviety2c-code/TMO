/**
 * Auto-Learn API — Query auto-learn records
 *
 * GET /api/auto-learn          — Get auto-learn stats + recent records
 * GET /api/auto-learn?stats=1  — Get aggregated stats only
 * GET /api/auto-learn?agent=xxx — Filter by agentId
 * GET /api/auto-learn?status=completed|failed|pending — Filter by status
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAutoLearnStats } from '@/lib/auto-learn'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const statsOnly = searchParams.get('stats') === '1'
    const agentId = searchParams.get('agent')
    const status = searchParams.get('status')

    // Stats-only mode
    if (statsOnly) {
      const stats = await getAutoLearnStats()
      return NextResponse.json({ stats, source: 'local' })
    }

    // Build filter
    const where: Record<string, unknown> = {}
    if (agentId) where.agentId = agentId
    if (status) where.status = status

    // Get records with filter
    const records = await db.autoLearnRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    const stats = await getAutoLearnStats()

    return NextResponse.json({
      records,
      stats,
      source: 'local',
    })
  } catch (error) {
    console.error('[AutoLearn API] GET error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get auto-learn data' },
      { status: 500 }
    )
  }
}
