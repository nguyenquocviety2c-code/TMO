/**
 * OpenClaw Automation API — Manage cron jobs and webhooks (full SQLite CRUD + REAL execution)
 *
 * GET  /api/openclaw/automation?type=cron|webhook|all
 * POST /api/openclaw/automation  { action, ...data }
 *
 * Actions:
 *   create-cron, update-cron, delete-cron, run-cron, toggle-cron
 *   create-webhook, update-webhook, delete-webhook, toggle-webhook, test-webhook
 *
 * run-cron: Executes the task via LLM and records real results
 * test-webhook: Sends a real HTTP POST to the webhook URL
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { executeCronJob, testWebhookDispatch, approximateNextRun } from '@/lib/automation-engine'

export const dynamic = 'force-dynamic'

const AGENT_ID = 'default'

// ─── GET ────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'cron'

    if (type === 'cron') {
      const jobs = await db.cronJob.findMany({
        where: { agentId: AGENT_ID },
        orderBy: { createdAt: 'desc' },
      })
      return NextResponse.json({ jobs, total: jobs.length })
    }

    if (type === 'webhook') {
      const webhooks = await db.webhook.findMany({
        where: { agentId: AGENT_ID },
        orderBy: { createdAt: 'desc' },
      })
      return NextResponse.json({ webhooks, total: webhooks.length })
    }

    if (type === 'all') {
      const [jobs, webhooks] = await Promise.all([
        db.cronJob.findMany({ where: { agentId: AGENT_ID }, orderBy: { createdAt: 'desc' } }),
        db.webhook.findMany({ where: { agentId: AGENT_ID }, orderBy: { createdAt: 'desc' } }),
      ])
      return NextResponse.json({ jobs, webhooks })
    }

    return NextResponse.json({ error: 'Invalid type parameter. Use cron, webhook, or all.' }, { status: 400 })
  } catch (error) {
    console.error('[Automation GET] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch automation data' }, { status: 500 })
  }
}

// ─── POST ───────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body

    // ── Cron Actions ──────────────────────────────────────────────────────

    if (action === 'create-cron') {
      const { expression, taskPrompt, enabled } = body
      if (!expression || !taskPrompt) {
        return NextResponse.json({ error: 'expression and taskPrompt are required' }, { status: 400 })
      }
      const nextRunAt = approximateNextRun(expression)
      const job = await db.cronJob.create({
        data: {
          agentId: AGENT_ID,
          expression,
          taskPrompt,
          enabled: enabled ?? true,
          nextRunAt,
        },
      })
      return NextResponse.json({ success: true, job })
    }

    if (action === 'update-cron') {
      const { id, expression, taskPrompt, enabled } = body
      if (!id) {
        return NextResponse.json({ error: 'id is required' }, { status: 400 })
      }
      const existing = await db.cronJob.findUnique({ where: { id } })
      if (!existing) {
        return NextResponse.json({ error: 'Cron job not found' }, { status: 404 })
      }
      const data: Record<string, unknown> = {}
      if (expression !== undefined) {
        data.expression = expression
        data.nextRunAt = approximateNextRun(expression)
      }
      if (taskPrompt !== undefined) data.taskPrompt = taskPrompt
      if (enabled !== undefined) data.enabled = enabled
      const job = await db.cronJob.update({ where: { id }, data })
      return NextResponse.json({ success: true, job })
    }

    if (action === 'delete-cron') {
      const { id } = body
      if (!id) {
        return NextResponse.json({ error: 'id is required' }, { status: 400 })
      }
      const existing = await db.cronJob.findUnique({ where: { id } })
      if (!existing) {
        return NextResponse.json({ error: 'Cron job not found' }, { status: 404 })
      }
      await db.cronJob.delete({ where: { id } })
      return NextResponse.json({ success: true, message: 'Cron job deleted' })
    }

    if (action === 'run-cron') {
      const { id } = body
      if (!id) {
        return NextResponse.json({ error: 'id is required' }, { status: 400 })
      }

      // Verify job exists first
      const job = await db.cronJob.findUnique({ where: { id } })
      if (!job) {
        return NextResponse.json({ error: 'Cron job not found' }, { status: 404 })
      }

      // Real execution — calls LLM and records actual results
      const result = await executeCronJob(id)

      return NextResponse.json({
        success: result.success,
        execution: {
          type: job.expression.startsWith('heartbeat:') ? 'heartbeat' : 'cron',
          taskPrompt: job.taskPrompt,
          expression: job.expression,
          llmResponse: result.content ? result.content.slice(0, 2000) : undefined,
          provider: result.provider,
          model: result.model,
          tokensUsed: result.tokensUsed,
          durationMs: result.durationMs,
          error: result.error,
        },
      })
    }

    if (action === 'toggle-cron') {
      const { id } = body
      if (!id) {
        return NextResponse.json({ error: 'id is required' }, { status: 400 })
      }
      const existing = await db.cronJob.findUnique({ where: { id } })
      if (!existing) {
        return NextResponse.json({ error: 'Cron job not found' }, { status: 404 })
      }
      const data: Record<string, unknown> = { enabled: !existing.enabled }
      if (!existing.enabled) {
        // Re-enabling: set nextRunAt
        data.nextRunAt = approximateNextRun(existing.expression)
      }
      const job = await db.cronJob.update({ where: { id }, data })
      return NextResponse.json({ success: true, job })
    }

    // ── Webhook Actions ───────────────────────────────────────────────────

    if (action === 'create-webhook') {
      const { url, events, secret, enabled } = body
      if (!url || !events) {
        return NextResponse.json({ error: 'url and events are required' }, { status: 400 })
      }
      const eventsStr = typeof events === 'string' ? events : JSON.stringify(events)
      const webhook = await db.webhook.create({
        data: {
          agentId: AGENT_ID,
          url,
          events: eventsStr,
          secret: secret ?? null,
          enabled: enabled ?? true,
        },
      })
      return NextResponse.json({ success: true, webhook })
    }

    if (action === 'update-webhook') {
      const { id, url, events, secret, enabled } = body
      if (!id) {
        return NextResponse.json({ error: 'id is required' }, { status: 400 })
      }
      const existing = await db.webhook.findUnique({ where: { id } })
      if (!existing) {
        return NextResponse.json({ error: 'Webhook not found' }, { status: 404 })
      }
      const data: Record<string, unknown> = {}
      if (url !== undefined) data.url = url
      if (events !== undefined) data.events = typeof events === 'string' ? events : JSON.stringify(events)
      if (secret !== undefined) data.secret = secret
      if (enabled !== undefined) data.enabled = enabled
      const webhook = await db.webhook.update({ where: { id }, data })
      return NextResponse.json({ success: true, webhook })
    }

    if (action === 'delete-webhook') {
      const { id } = body
      if (!id) {
        return NextResponse.json({ error: 'id is required' }, { status: 400 })
      }
      const existing = await db.webhook.findUnique({ where: { id } })
      if (!existing) {
        return NextResponse.json({ error: 'Webhook not found' }, { status: 404 })
      }
      await db.webhook.delete({ where: { id } })
      return NextResponse.json({ success: true, message: 'Webhook deleted' })
    }

    if (action === 'toggle-webhook') {
      const { id } = body
      if (!id) {
        return NextResponse.json({ error: 'id is required' }, { status: 400 })
      }
      const existing = await db.webhook.findUnique({ where: { id } })
      if (!existing) {
        return NextResponse.json({ error: 'Webhook not found' }, { status: 404 })
      }
      const webhook = await db.webhook.update({
        where: { id },
        data: { enabled: !existing.enabled },
      })
      return NextResponse.json({ success: true, webhook })
    }

    if (action === 'test-webhook') {
      const { id } = body
      if (!id) {
        return NextResponse.json({ error: 'id is required' }, { status: 400 })
      }

      // Real dispatch — actually sends HTTP POST to the webhook URL
      const result = await testWebhookDispatch(id)

      return NextResponse.json({
        success: result.success,
        dispatch: {
          httpStatus: result.httpStatus,
          responseBody: result.responseBody.slice(0, 2000),
          durationMs: result.durationMs,
          error: result.error,
        },
      })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (error) {
    console.error('[Automation POST] Error:', error)
    return NextResponse.json({ error: 'Failed to process automation action' }, { status: 500 })
  }
}
