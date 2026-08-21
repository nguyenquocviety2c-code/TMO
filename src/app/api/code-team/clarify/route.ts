/**
 * Code Team — Clarification Response API Endpoint
 *
 * POST /api/code-team/clarify
 *
 * Accepts a clarification response from the client and resumes the workflow
 * that was paused for clarification.
 *
 * Request body:
 *   - sessionId: string — Session ID of the paused workflow
 *   - requestId: string — ID of the clarification request being answered
 *   - answer: string — User's answer/selection
 *
 * SSE Events emitted:
 *   - clarification_resolved: { requestId, selectedOption, updatedContext }
 *   - workflow_start: { sessionId }
 *   - agent_start: { agent, position, step, avatar }
 *   - agent_chunk: { agent, position, content }
 *   - agent_complete: { agent, position, step, content, duration }
 *   - progress_report: { formattedReport, stepIndex, totalSteps, status }
 *   - final_report: { formattedReport, totalSteps, completedSteps, failedSteps, totalTokensUsed, totalTimeSpent }
 *   - workflow_done: { totalDuration, sessionId, status }
 *   - error: { agent?, message }
 */

import { NextRequest } from 'next/server'
import { resumeWorkflow } from '@/lib/code-team/workflow-engine'
import type { ClarificationResponse } from '@/lib/communication'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min timeout for long workflows

export async function POST(request: NextRequest) {
  let body: { sessionId?: string; requestId?: string; answer?: string }

  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { sessionId, requestId, answer } = body

  // Validate required fields
  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'sessionId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!requestId) {
    return new Response(JSON.stringify({ error: 'requestId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!answer) {
    return new Response(JSON.stringify({ error: 'answer is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Build ClarificationResponse
  const clarificationResponse: ClarificationResponse = {
    requestId,
    selectedOption: answer,
    updatedContext: `User selected: ${answer}`,
    isFollowUp: false,
  }

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
          isClosed = true
          abortController.abort()
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
          abortController.abort()
          clearInterval(heartbeatInterval)
        }
      }, 15000)

      try {
        await resumeWorkflow(
          sessionId,
          clarificationResponse,
          emit,
          abortController.signal,
          { continueOnDisconnect: true }
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
      isClosed = true
      abortController.abort()
      console.log(`[ClarifyAPI] Client disconnected for session ${sessionId}`)
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