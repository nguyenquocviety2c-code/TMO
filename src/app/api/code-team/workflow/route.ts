/**
 * Code Team — Workflow SSE API Endpoint
 *
 * POST /api/code-team/workflow
 *
 * Accepts a workflow request and returns SSE (Server-Sent Events) stream
 * with real-time workflow events from the Code Team.
 *
 * Request body:
 *   - messages: Array<{ role: string; content: string }> — Chat history
 *   - sessionId: string — Session ID for tracking
 *   - userRequest: string — The user's current request (e.g., "triển khai feature login")
 *   - routing?: RoutingDecision — Pre-computed routing from TL Assessment (Phase 2: Smart TL Bridge)
 *     If provided, TL analyze step is skipped and pipeline starts immediately.
 *   - continueOnDisconnect?: boolean — Whether workflow continues in backend after client disconnects (default: true)
 *
 * Query parameters:
 *   - continueOnDisconnect=true (default) — Workflow continues running in background after client disconnects
 *   - continueOnDisconnect=false — Workflow aborts when client disconnects (old behavior)
 *
 * SSE Events emitted:
 *   - workflow_start: { sessionId }
 *   - agent_start: { agent, position, step, avatar }
 *   - agent_chunk: { agent, position, content }
 *   - agent_complete: { agent, position, step, content, duration }
 *   - tool_call: { agent, position, tool, detail }
 *   - tool_result: { agent, position, tool, result, detail, duration }
 *   - checkpoint: { after, step, decision?, reasoning? }
 *   - workflow_done: { totalDuration, sessionId, status }
 *   - error: { agent?, message }
 *   - heartbeat: { timestamp } — sent every 15s to keep connection alive
 */

import { NextRequest } from 'next/server'
import { runWorkflow } from '@/lib/code-team/workflow-engine'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min timeout for long workflows

export async function POST(request: NextRequest) {
  let body: { messages?: Array<{ role: string; content: string }>; sessionId?: string; userRequest?: string; routing?: Record<string, unknown>; continueOnDisconnect?: boolean }

  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { messages = [], sessionId, userRequest, routing: rawRouting } = body

  // Validate required fields
  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'sessionId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!userRequest) {
    return new Response(JSON.stringify({ error: 'userRequest is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Read continueOnDisconnect from body or query parameter (default: true)
  const queryContinue = request.nextUrl.searchParams.get('continueOnDisconnect')
  const continueOnDisconnect = body.continueOnDisconnect ?? (queryContinue === 'false' ? false : true)

  // AbortController — allows workflow engine to cancel when client disconnects
  const abortController = new AbortController()

  const encoder = new TextEncoder()
  let isClosed = false

  const stream = new ReadableStream({
    async start(controller) {
      // SSE emitter — sends events to client
      const emit = (event: Record<string, unknown>) => {
        if (isClosed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {
          // Client disconnected — mark as closed
          // NOTE: With continueOnDisconnect=true, workflow engine handles this gracefully
          // by switching to no-op emit instead of aborting
          isClosed = true
          if (!continueOnDisconnect) {
            abortController.abort()
          }
        }
      }

      // Heartbeat: send every 15s to prevent proxy/CDN timeout
      const heartbeatInterval = setInterval(() => {
        if (isClosed) {
          clearInterval(heartbeatInterval)
          return
        }
        try {
          controller.enqueue(encoder.encode(`:heartbeat ${Date.now()}\n\n`))
        } catch {
          isClosed = true
          if (!continueOnDisconnect) {
            abortController.abort()
          }
          clearInterval(heartbeatInterval)
        }
      }, 15000)

      try {
        // Phase 2: Smart TL Bridge — accept pre-computed routing from TL Assessment
        // If routing is provided, TL analyze step is skipped and pipeline starts immediately
        let routing: import('@/lib/code-team/worklog').RoutingDecision | undefined
        if (rawRouting && rawRouting.mode && rawRouting.tier && rawRouting.score !== undefined) {
          // Validate routing fields at runtime (type assertions don't validate)
          const validModes = ['A', 'B', 'C'] as const
          const validTiers = [1, 2, 3] as const
          const mode = validModes.includes(rawRouting.mode as typeof validModes[number])
            ? (rawRouting.mode as 'A' | 'B' | 'C')
            : undefined
          const tier = validTiers.includes(rawRouting.tier as typeof validTiers[number])
            ? (rawRouting.tier as 1 | 2 | 3)
            : undefined
          const score = typeof rawRouting.score === 'number'
            ? Math.min(9, Math.max(3, rawRouting.score))
            : undefined

          if (mode && tier && score !== undefined) {
            routing = {
              mode,
              tier,
              score,
              reasoning: (rawRouting.reasoning as string) || 'Pre-computed from TL Assessment',
              parts: Array.isArray(rawRouting.parts)
                ? rawRouting.parts as Array<{ name: string; type: 'visual' | 'backend'; description: string; dependency: string[] }>
                : [{ name: 'main', type: 'backend' as const, description: userRequest || '', dependency: [] }],
              spec: (rawRouting.spec as string) || userRequest || '',
            }
            console.log(`[WorkflowAPI] Pre-computed routing received: Mode ${routing.mode}, Tier ${routing.tier}, Score ${routing.score}`)
          } else {
            console.warn(`[WorkflowAPI] Invalid routing fields received (mode=${rawRouting.mode}, tier=${rawRouting.tier}, score=${rawRouting.score}) — falling back to TL analyze`)
          }
        }

        await runWorkflow(
          { messages, sessionId, userRequest, routing },
          emit,
          abortController.signal,
          { continueOnDisconnect }
        )
      } catch (err) {
        if (!isClosed) {
          emit({
            type: 'error',
            agent: 'SYSTEM',
            message: err instanceof Error ? err.message : String(err),
          })
        }
      } finally {
        clearInterval(heartbeatInterval)
      }

      // Close the stream
      try {
        controller.close()
      } catch {
        // Stream already closed
      }
    },

    cancel() {
      // Client disconnected — mark stream as closed
      isClosed = true
      if (!continueOnDisconnect) {
        // Old behavior: abort workflow when client disconnects
        abortController.abort()
        console.log(`[WorkflowAPI] Client disconnected for session ${sessionId} — workflow aborted`)
      } else {
        // New behavior: workflow continues in background
        // The abortController.signal will be aborted, but runWorkflow's isAborted()
        // will return false when continueOnDisconnect=true and clientDisconnected=true
        abortController.abort()
        console.log(`[WorkflowAPI] Client disconnected for session ${sessionId} — workflow continues in background (continueOnDisconnect: true)`)
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  })
}
