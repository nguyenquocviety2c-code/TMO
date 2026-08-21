/**
 * OpenClaw Task Execution History API
 *
 * GET /api/openclaw/automation/history?type=cron|webhook|heartbeat|manual&status=completed|failed|running&limit=50&offset=0
 *
 * Returns TaskExecution records with optional filters, ordered by startedAt desc.
 */

import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

const VALID_TYPES = ['cron', 'webhook', 'heartbeat', 'manual']
const VALID_STATUSES = ['completed', 'failed', 'running', 'pending']

// ─── GET ────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    const type = searchParams.get('type')
    const status = searchParams.get('status')
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 200)
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0)

    // Build where clause
    const where: Prisma.TaskExecutionWhereInput = {}

    if (type) {
      if (!VALID_TYPES.includes(type)) {
        return NextResponse.json(
          { error: `Invalid type filter. Must be one of: ${VALID_TYPES.join(', ')}` },
          { status: 400 }
        )
      }
      where.type = type
    }

    if (status) {
      if (!VALID_STATUSES.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status filter. Must be one of: ${VALID_STATUSES.join(', ')}` },
          { status: 400 }
        )
      }
      where.status = status
    }

    const [tasks, total] = await Promise.all([
      db.taskExecution.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.taskExecution.count({ where }),
    ])

    return NextResponse.json({
      tasks,
      total,
      limit,
      offset,
      hasMore: offset + tasks.length < total,
    })
  } catch (error) {
    console.error('[History GET] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch task execution history' }, { status: 500 })
  }
}
