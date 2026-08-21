/**
 * Knowledge Write Tool — Agent tool for writing to the Knowledge Base
 *
 * POST /api/openclaw/tools/knowledge-write
 *
 * Actions:
 * - "create_entity": Create a new entity in the local buffer
 *   Body: { action: "create_entity", entity: { name, type, description, domain } }
 *
 * - "create_relationship": Create a new relationship in the local buffer
 *   Body: { action: "create_relationship", relationship: { sourceName, targetName, type, description } }
 */

import { NextRequest, NextResponse } from 'next/server'
import { agentWriteEntity, agentWriteRelationship } from '@/lib/knowledge-bridge'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body

    if (!action) {
      return NextResponse.json(
        { error: 'action is required ("create_entity" or "create_relationship")' },
        { status: 400 }
      )
    }

    // Check write permissions from policy
    const policy = await db.knowledgeAccessPolicy.findUnique({
      where: { agentId: 'default' },
    })

    if (policy && !policy.allowWrite) {
      return NextResponse.json(
        { error: 'Write access is denied by current policy' },
        { status: 403 }
      )
    }

    switch (action) {
      case 'create_entity': {
        const { entity } = body
        if (!entity || !entity.name || !entity.type || !entity.description || !entity.domain) {
          return NextResponse.json(
            { error: 'entity must include name, type, description, and domain' },
            { status: 400 }
          )
        }

        const result = await agentWriteEntity({
          entityName: entity.name,
          entityType: entity.type,
          description: entity.description,
          domain: entity.domain,
          properties: entity.properties,
        })

        return NextResponse.json({
          success: true,
          action: 'create_entity',
          result,
          message: `Entity "${entity.name}" created in local buffer (synced=false)`,
        })
      }

      case 'create_relationship': {
        const { relationship } = body
        if (!relationship || !relationship.sourceName || !relationship.targetName || !relationship.type || !relationship.description) {
          return NextResponse.json(
            { error: 'relationship must include sourceName, targetName, type, and description' },
            { status: 400 }
          )
        }

        const result = await agentWriteRelationship({
          sourceEntityName: relationship.sourceName,
          targetEntityName: relationship.targetName,
          relationshipType: relationship.type,
          description: relationship.description,
        })

        return NextResponse.json({
          success: true,
          action: 'create_relationship',
          result,
          message: `Relationship "${relationship.sourceName} -[${relationship.type}]-> ${relationship.targetName}" created in local buffer (synced=false)`,
        })
      }

      default:
        return NextResponse.json(
          { error: `Unknown action "${action}". Supported: create_entity, create_relationship` },
          { status: 400 }
        )
    }
  } catch (err) {
    return NextResponse.json(
      { error: 'Knowledge write tool failed', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
