/**
 * OC-3.3: Auto-Knowledge Capture from OpenCode Sessions
 * 
 * POST /api/opencode/knowledge/capture
 * 
 * After an OpenCode session completes, this endpoint:
 * 1. Extracts insights from session summary
 * 2. Saves insights as AgentInsight records
 * 3. Creates entities in Knowledge Graph
 * 4. Logs the capture event
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { extractInsightsFromSessionData } from '@/lib/opencode-knowledge-context'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, summary, filesChanged, toolsUsed } = body

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    }

    // 1. Extract insights from session data
    const insights = extractInsightsFromSessionData(
      summary || '',
      filesChanged || [],
      toolsUsed || []
    )

    let capturedCount = 0

    // 2. Save insights to DB
    for (const insight of insights) {
      try {
        await db.agentInsight.create({
          data: {
            agentId: 'opencode',
            content: insight.content,
            source: 'auto_opencode',
            type: insight.type,
            confidence: insight.confidence,
          },
        })
        capturedCount++
      } catch {
        // Skip if fails
      }
    }

    // 3. Create entities in KB for code modules
    for (const file of filesChanged || []) {
      try {
        await db.localEntity.create({
          data: {
            entityName: file,
            entityType: 'CodeFile',
            description: `Code file modified in OpenCode session ${sessionId}`,
            domain: 'codebase',
            source: 'auto_opencode',
            properties: JSON.stringify({
              sessionId,
              modifiedAt: new Date().toISOString(),
              summary: (summary || '').substring(0, 200),
            }),
          },
        })
      } catch {
        // Entity may already exist
      }
    }

    // 4. Update the OpenCodeSession record
    try {
      const session = await db.openCodeSession.findFirst({
        where: { sessionId },
      })
      if (session) {
        const existingTools = JSON.parse(session.toolsUsed || '[]')
        const existingFiles = JSON.parse(session.filesTouched || '[]')
        await db.openCodeSession.update({
          where: { id: session.id },
          data: {
            status: 'completed',
            toolsUsed: JSON.stringify([...new Set([...existingTools, ...(toolsUsed || [])])]),
            filesTouched: JSON.stringify([...new Set([...existingFiles, ...(filesChanged || [])])]),
          },
        })
      }
    } catch {
      // Session may not exist
    }

    // 5. Log capture event
    try {
      await db.learningLog.create({
        data: {
          eventType: 'pattern',
          content: JSON.stringify({
            type: 'opencode_knowledge_capture',
            sessionId,
            insightsCaptured: capturedCount,
            filesChanged: filesChanged?.length || 0,
            toolsUsed: toolsUsed?.length || 0,
          }),
        },
      })
    } catch {
      // Log may fail
    }

    return NextResponse.json({
      captured: capturedCount,
      insights: insights.map(i => ({
        content: i.content,
        type: i.type,
        confidence: i.confidence,
      })),
      entitiesCreated: (filesChanged || []).length,
      sessionId,
    })
  } catch (error) {
    console.error('[opencode/knowledge/capture] Error:', error)
    return NextResponse.json(
      { error: 'Failed to capture knowledge', details: String(error) },
      { status: 500 }
    )
  }
}
