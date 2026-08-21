/**
 * Webhook Events API — Inbound webhook receiver + event dispatcher
 *
 * POST /api/openclaw/automation/events
 *   - Receives events and dispatches to matching webhooks
 *   - Body: { event: string, data: Record<string, unknown> }
 *
 * GET /api/openclaw/automation/events
 *   - Returns available event types from installed webhooks
 */

import { NextRequest, NextResponse } from 'next/server'
import { dispatchEventToWebhooks } from '@/lib/automation-engine'

export const dynamic = 'force-dynamic'

// Well-known event types for auto-complete
const KNOWN_EVENTS = [
  'query.completed',
  'query.failed',
  'document.processed',
  'document.failed',
  'entity.created',
  'relationship.created',
  'knowledge.synced',
  'agent.learning',
  'agent.error',
  'cron.completed',
  'cron.failed',
  'heartbeat.completed',
  'system.health',
  'system.alert',
]

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { event, data } = body

    if (!event) {
      return NextResponse.json({ error: 'event is required' }, { status: 400 })
    }

    // Dispatch to all matching webhooks
    const results = await dispatchEventToWebhooks(event, data || {})

    const successCount = results.filter(r => r.result.success).length

    return NextResponse.json({
      success: true,
      event,
      dispatched: results.length,
      successful: successCount,
      failed: results.length - successCount,
      details: results.map(r => ({
        webhookId: r.webhookId,
        success: r.result.success,
        httpStatus: r.result.httpStatus,
        durationMs: r.result.durationMs,
        error: r.result.error,
      })),
    })
  } catch (error) {
    console.error('[Events POST] Error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    eventTypes: KNOWN_EVENTS,
    hint: 'POST to /api/openclaw/automation/events with { event, data } to dispatch to webhooks',
  })
}
