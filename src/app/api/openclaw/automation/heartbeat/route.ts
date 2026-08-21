/**
 * OpenClaw Heartbeat API — Manage heartbeat cron job configuration
 *
 * GET  /api/openclaw/automation/heartbeat — Return current heartbeat config
 * PUT  /api/openclaw/automation/heartbeat — Upsert heartbeat cron job
 *
 * Heartbeat is a special CronJob with expression prefixed "heartbeat:"
 * e.g. expression = "heartbeat:5m" means every 5 minutes
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { approximateNextRun } from '@/lib/automation-engine'

export const dynamic = 'force-dynamic'

const AGENT_ID = 'default'
const HEARTBEAT_PREFIX = 'heartbeat:'

const VALID_INTERVALS = ['1m', '5m', '15m', '30m', '1h']

const DEFAULT_CONFIG = {
  interval: '5m',
  actionPrompt: 'Kiểm tra sức khỏe hệ thống',
  enabled: false,
}

// ─── GET ────────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    // Find any heartbeat cron job (expression starts with "heartbeat:")
    const heartbeatJobs = await db.cronJob.findMany({
      where: {
        agentId: AGENT_ID,
        expression: { startsWith: HEARTBEAT_PREFIX },
      },
    })

    if (heartbeatJobs.length === 0) {
      return NextResponse.json({ config: DEFAULT_CONFIG, exists: false })
    }

    // Use the most recent heartbeat job
    const job = heartbeatJobs[0]
    const interval = job.expression.replace(HEARTBEAT_PREFIX, '')

    return NextResponse.json({
      config: {
        interval,
        actionPrompt: job.taskPrompt,
        enabled: job.enabled,
      },
      exists: true,
      job: {
        id: job.id,
        expression: job.expression,
        lastRunAt: job.lastRunAt,
        nextRunAt: job.nextRunAt,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
    })
  } catch (error) {
    console.error('[Heartbeat GET] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch heartbeat config' }, { status: 500 })
  }
}

// ─── PUT ────────────────────────────────────────────────────────────────────────

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { interval, actionPrompt, enabled } = body

    // Validate interval
    if (interval && !VALID_INTERVALS.includes(interval)) {
      return NextResponse.json(
        { error: `Invalid interval. Must be one of: ${VALID_INTERVALS.join(', ')}` },
        { status: 400 }
      )
    }

    // Find existing heartbeat job
    const existingJobs = await db.cronJob.findMany({
      where: {
        agentId: AGENT_ID,
        expression: { startsWith: HEARTBEAT_PREFIX },
      },
    })

    const resolvedInterval = interval ?? (existingJobs.length > 0 ? existingJobs[0].expression.replace(HEARTBEAT_PREFIX, '') : DEFAULT_CONFIG.interval)
    const resolvedPrompt = actionPrompt ?? (existingJobs.length > 0 ? existingJobs[0].taskPrompt : DEFAULT_CONFIG.actionPrompt)
    const resolvedEnabled = enabled ?? (existingJobs.length > 0 ? existingJobs[0].enabled : DEFAULT_CONFIG.enabled)
    const expression = `${HEARTBEAT_PREFIX}${resolvedInterval}`

    if (existingJobs.length > 0) {
      // Update the first existing heartbeat job
      const job = await db.cronJob.update({
        where: { id: existingJobs[0].id },
        data: {
          expression,
          taskPrompt: resolvedPrompt,
          enabled: resolvedEnabled,
          nextRunAt: resolvedEnabled ? approximateNextRun(`${HEARTBEAT_PREFIX}${resolvedInterval}`) : null,
        },
      })
      return NextResponse.json({
        success: true,
        config: {
          interval: resolvedInterval,
          actionPrompt: resolvedPrompt,
          enabled: resolvedEnabled,
        },
        job,
      })
    }

    // Create new heartbeat job
    const job = await db.cronJob.create({
      data: {
        agentId: AGENT_ID,
        expression,
        taskPrompt: resolvedPrompt,
        enabled: resolvedEnabled,
        nextRunAt: resolvedEnabled ? approximateNextRun(`${HEARTBEAT_PREFIX}${resolvedInterval}`) : null,
      },
    })

    return NextResponse.json({
      success: true,
      config: {
        interval: resolvedInterval,
        actionPrompt: resolvedPrompt,
        enabled: resolvedEnabled,
      },
      job,
    })
  } catch (error) {
    console.error('[Heartbeat PUT] Error:', error)
    return NextResponse.json({ error: 'Failed to update heartbeat config' }, { status: 500 })
  }
}
