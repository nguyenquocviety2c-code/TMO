/**
 * OpenClaw Feedback API — Save user feedback (👍/👎)
 *
 * POST — Save feedback to LearningLog table
 * Body: { type: 'positive' | 'negative', sessionId, messageId, content, agentResponse, correction?, reason? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { storeMemory } from '@/lib/agent-memory'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, sessionId, messageId, content, agentResponse, correction, reason, agentId } = body

    if (!type || !['positive', 'negative'].includes(type)) {
      return NextResponse.json(
        { error: 'type must be "positive" or "negative"' },
        { status: 400 }
      )
    }

    // Save to LearningLog
    const log = await db.learningLog.create({
      data: {
        sessionId: sessionId || null,
        agentId: agentId || 'default',
        eventType: 'feedback',
        content: JSON.stringify({
          type,
          messageId: messageId || null,
          userContent: content || '',
          agentResponse: agentResponse || '',
          correction: correction || null,
          reason: reason || null,
          timestamp: new Date().toISOString(),
        }),
        metadata: JSON.stringify({ feedbackType: type }),
      },
    })

    // If negative with correction, also create AgentCorrection
    if (type === 'negative' && correction) {
      const effectiveAgentId = agentId || 'default'

      // Store the correction as a memory so the agent can learn from it
      try {
        await storeMemory({
          agentId: effectiveAgentId,
          agentName: effectiveAgentId,
          category: 'correction',
          content: `Correction: ${correction}`,
          context: `User corrected agent. Wrong answer: ${(agentResponse || '').slice(0, 200)}`,
          importance: 0.8,
          source: 'user_feedback',
        })
      } catch (memErr) {
        console.warn('[Feedback] Failed to store correction as memory:', memErr instanceof Error ? memErr.message : String(memErr))
      }

      // Mark correction as applied since we've stored it in the agent's memory
      await db.agentCorrection.create({
        data: {
          agentId: effectiveAgentId,
          wrongAnswer: agentResponse || '',
          correctAnswer: correction,
          reason: reason || null,
          applied: true,
        },
      })
    }

    return NextResponse.json({
      success: true,
      logId: log.id,
      type,
      created: type === 'negative' && correction ? 'correction' : 'feedback',
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to save feedback', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
