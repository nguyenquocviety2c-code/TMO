/**
 * Teach Agent API
 *
 * POST — Manually teach the agent (insight, correction, preference, standing order)
 * Body: { type: 'insight' | 'correction' | 'preference' | 'order', content, relatedEntity?, metadata? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, content, relatedEntity, metadata } = body

    if (!type || !['insight', 'correction', 'preference', 'order'].includes(type)) {
      return NextResponse.json(
        { error: 'type must be "insight", "correction", "preference", or "order"' },
        { status: 400 }
      )
    }

    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json(
        { error: 'content is required and must be a non-empty string' },
        { status: 400 }
      )
    }

    const agentId = body.agentId || 'default'
    let result: { id: string; type: string; created: string }

    switch (type) {
      case 'insight': {
        const insightType = metadata?.insightType || 'factual'
        const confidence = metadata?.confidence ?? 0.8
        const source = metadata?.source || 'manual'

        const insight = await db.agentInsight.create({
          data: {
            agentId,
            content: content.trim(),
            source,
            type: insightType,
            confidence: Math.min(Math.max(confidence, 0), 1),
          },
        })

        // Also log to LearningLog
        await db.learningLog.create({
          data: {
            agentId,
            eventType: 'insight',
            content: JSON.stringify({
              insightId: insight.id,
              text: content.trim(),
              insightType,
              confidence,
              source,
              relatedEntity: relatedEntity || null,
            }),
            metadata: metadata ? JSON.stringify(metadata) : null,
          },
        })

        result = { id: insight.id, type: 'insight', created: 'AgentInsight + LearningLog' }
        break
      }

      case 'correction': {
        const wrongAnswer = metadata?.wrongAnswer || ''
        const reason = metadata?.reason || ''

        if (!wrongAnswer) {
          return NextResponse.json(
            { error: 'correction requires metadata.wrongAnswer' },
            { status: 400 }
          )
        }

        const correction = await db.agentCorrection.create({
          data: {
            agentId,
            wrongAnswer,
            correctAnswer: content.trim(),
            reason,
            applied: false,
          },
        })

        // Also log to LearningLog
        await db.learningLog.create({
          data: {
            agentId,
            eventType: 'correction',
            content: JSON.stringify({
              correctionId: correction.id,
              wrongAnswer,
              correctAnswer: content.trim(),
              reason,
              relatedEntity: relatedEntity || null,
            }),
            metadata: metadata ? JSON.stringify(metadata) : null,
          },
        })

        result = { id: correction.id, type: 'correction', created: 'AgentCorrection + LearningLog' }
        break
      }

      case 'preference': {
        const preferenceKey = metadata?.preferenceKey || content.trim().split(':')[0] || 'general'
        const preferenceValue = metadata?.preferenceValue || content.trim()
        const source = metadata?.source || 'manual'

        // Upsert preference (unique on agentId + preferenceKey)
        const pref = await db.agentPreference.upsert({
          where: { agentId_preferenceKey: { agentId, preferenceKey } },
          create: {
            agentId,
            preferenceKey,
            preferenceValue,
            source,
          },
          update: {
            preferenceValue,
            source,
          },
        })

        // Also log to LearningLog
        await db.learningLog.create({
          data: {
            agentId,
            eventType: 'preference',
            content: JSON.stringify({
              preferenceId: pref.id,
              key: preferenceKey,
              value: preferenceValue,
              source,
            }),
          },
        })

        result = { id: pref.id, type: 'preference', created: 'AgentPreference (upsert) + LearningLog' }
        break
      }

      case 'order': {
        const priority = metadata?.priority ?? 0
        const enabled = metadata?.enabled ?? true

        const order = await db.standingOrder.create({
          data: {
            agentId,
            order: content.trim(),
            priority,
            enabled,
          },
        })

        // Also log to LearningLog
        await db.learningLog.create({
          data: {
            agentId,
            eventType: 'pattern',
            content: JSON.stringify({
              orderId: order.id,
              order: content.trim(),
              priority,
              enabled,
            }),
          },
        })

        result = { id: order.id, type: 'order', created: 'StandingOrder + LearningLog' }
        break
      }

      default:
        return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }

    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to teach agent', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
