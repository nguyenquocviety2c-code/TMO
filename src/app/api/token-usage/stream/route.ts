/**
 * Token Usage SSE Stream — Real-time token updates via Server-Sent Events
 *
 * GET /api/token-usage/stream — SSE endpoint that pushes token data
 * to the frontend whenever tokens are consumed (addTokensUsed/addTokensUsedByAgent).
 *
 * Architecture:
 *   - Backend: tokenEmitter (EventEmitter) fires 'token-update' on every token change
 *   - This endpoint subscribes to tokenEmitter and forwards data as SSE events
 *   - Frontend: EventSource connection receives real-time updates (< 500ms latency)
 *   - Throttled to max 1 event/500ms to prevent flooding
 *
 * Benefits over polling:
 *   - No wasted requests when idle (0 vs 2 req/5s)
 *   - Instant updates (< 500ms vs 0-5s polling delay)
 *   - Less CPU/DB load (no SQLite queries on each poll)
 *   - Data comes from in-memory — no SQLite read needed for live updates
 */

import { tokenEmitter, getDailyTokenUsage, getDailyTokensByProvider, getDailyTokensByProviderSlot, getDailyTokensByProviderModel, getDailyTokensByAgent } from '@/lib/llm'

export const dynamic = 'force-dynamic'

export async function GET() {
  // Build the initial snapshot from in-memory data
  const todayUsage = await getDailyTokenUsage()
  const initialData = {
    date: todayUsage.date,
    tokens: todayUsage.tokens,
    providers: getDailyTokensByProvider(),
    slots: getDailyTokensByProviderSlot(),
    models: getDailyTokensByProviderModel(),
    agents: getDailyTokensByAgent(),
  }

  const encoder = new TextEncoder()

  // Cleanup references
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let onUpdate: ((snapshot: any) => void) | null = null
  let closed = false

  // Create a ReadableStream for SSE
  const stream = new ReadableStream({
    start(controller) {
      // Send initial snapshot immediately on connection
      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(initialData)}\n\n`))
      } catch {
        closed = true
        return
      }

      // Subscribe to token updates from the EventEmitter
      onUpdate = (snapshot: typeof initialData) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(snapshot)}\n\n`))
        } catch {
          // Stream closed — cleanup
          closed = true
          if (onUpdate) tokenEmitter.off('token-update', onUpdate)
          if (heartbeatTimer) clearInterval(heartbeatTimer)
        }
      }

      tokenEmitter.on('token-update', onUpdate)

      // Heartbeat every 15s to keep connection alive and force-flush buffered events.
      // Next.js dev server may buffer SSE events; frequent heartbeats ensure
      // the connection stays active and events are delivered promptly.
      heartbeatTimer = setInterval(() => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        } catch {
          closed = true
          if (onUpdate) tokenEmitter.off('token-update', onUpdate)
          if (heartbeatTimer) clearInterval(heartbeatTimer)
        }
      }, 15_000)
    },
    cancel() {
      // Client disconnected — cleanup listener
      closed = true
      if (onUpdate) tokenEmitter.off('token-update', onUpdate)
      if (heartbeatTimer) clearInterval(heartbeatTimer)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
      'Transfer-Encoding': 'chunked', // Ensure SSE events are flushed immediately
    },
  })
}
