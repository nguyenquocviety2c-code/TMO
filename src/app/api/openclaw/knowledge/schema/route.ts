/**
 * Knowledge Schema API — Enhanced schema info from all 3 databases
 *
 * GET /api/openclaw/knowledge/schema
 *
 * Returns:
 * - Prisma: models, field details, indexes, row counts
 * - Neo4j: labels, relationship types, node/relationship counts
 * - Qdrant: collections with point counts, vector size, and status
 */

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Static Prisma model definitions (derived from schema.prisma)
const PRISMA_MODELS: Record<string, {
  fields: string[]
  indexes: string[]
}> = {
  JobQueue: {
    fields: ['id', 'type', 'status', 'documentId', 'input', 'output', 'error', 'progress', 'priority', 'attempts', 'maxAttempts', 'createdAt', 'updatedAt', 'startedAt', 'completedAt'],
    indexes: ['status_priority', 'type_status', 'documentId'],
  },
  DailyTokenUsage: {
    fields: ['id', 'date', 'tokens', 'updatedAt'],
    indexes: ['date'],
  },
  DailyTokenByProvider: {
    fields: ['id', 'date', 'provider', 'tokens', 'updatedAt'],
    indexes: ['date_provider_unique', 'date'],
  },
  DailyTokenByProviderSlot: {
    fields: ['id', 'date', 'provider', 'slot', 'tokens', 'updatedAt'],
    indexes: ['date_provider_slot_unique', 'date'],
  },
  DailyTokenByProviderModel: {
    fields: ['id', 'date', 'provider', 'model', 'tokens', 'updatedAt'],
    indexes: ['date_provider_model_unique', 'date'],
  },
  LocalEntity: {
    fields: ['id', 'documentId', 'chunkId', 'entityName', 'entityType', 'description', 'properties', 'confidenceScore', 'source', 'domain', 'resolvedEntityId', 'synced', 'createdAt', 'updatedAt'],
    indexes: ['documentId', 'entityName', 'entityType', 'domain', 'synced'],
  },
  LocalRelationship: {
    fields: ['id', 'documentId', 'sourceEntityId', 'targetEntityId', 'sourceEntityName', 'targetEntityName', 'relationshipType', 'description', 'confidenceScore', 'source', 'synced', 'createdAt', 'updatedAt'],
    indexes: ['documentId', 'relationshipType', 'sourceEntityId', 'targetEntityId', 'synced'],
  },
  LocalResolvedEntity: {
    fields: ['id', 'canonicalName', 'entityType', 'description', 'properties', 'avgConfidence', 'occurrenceCount', 'domains', 'synced', 'createdAt', 'updatedAt'],
    indexes: ['canonicalName_unique', 'synced'],
  },
  AgentProfile: {
    fields: ['id', 'name', 'description', 'instruction', 'domain', 'capable', 'provider', 'model', 'temperature', 'maxTokens', 'team', 'position', 'avatar', 'enabled', 'createdAt', 'updatedAt'],
    indexes: ['name_unique', 'team', 'provider', 'enabled'],
  },
  AgentSession: {
    fields: ['id', 'agentId', 'sessionId', 'model', 'provider', 'title', 'messageCount', 'agentProfileId', 'teamMode', 'teamName', 'createdAt', 'updatedAt'],
    indexes: ['agentId', 'agentProfileId', 'teamName', 'createdAt', 'sessionId_unique'],
  },
  LearningLog: {
    fields: ['id', 'sessionId', 'agentId', 'eventType', 'content', 'metadata', 'createdAt'],
    indexes: ['agentId', 'eventType', 'createdAt'],
  },
  AgentInsight: {
    fields: ['id', 'agentId', 'content', 'source', 'type', 'confidence', 'createdAt'],
    indexes: ['agentId', 'type', 'createdAt'],
  },
  AgentCorrection: {
    fields: ['id', 'agentId', 'wrongAnswer', 'correctAnswer', 'reason', 'applied', 'createdAt'],
    indexes: ['agentId', 'applied'],
  },
  AgentPreference: {
    fields: ['id', 'agentId', 'preferenceKey', 'preferenceValue', 'source', 'createdAt'],
    indexes: ['agentId_preferenceKey_unique'],
  },
  AgentSkill: {
    fields: ['id', 'agentId', 'slug', 'name', 'content', 'source', 'enabled', 'version', 'installedAt', 'updatedAt'],
    indexes: ['agentId_slug_unique'],
  },
  ToolPermission: {
    fields: ['id', 'agentId', 'toolName', 'permission'],
    indexes: ['agentId_toolName_unique'],
  },
  KnowledgeAccessPolicy: {
    fields: ['id', 'agentId', 'allowRead', 'allowWrite', 'allowDelete', 'allowedCollections', 'allowedLabels'],
    indexes: ['agentId_unique'],
  },
  CronJob: {
    fields: ['id', 'agentId', 'expression', 'taskPrompt', 'enabled', 'lastRunAt', 'nextRunAt', 'createdAt', 'updatedAt'],
    indexes: ['agentId', 'enabled'],
  },
  Webhook: {
    fields: ['id', 'agentId', 'url', 'events', 'secret', 'enabled', 'createdAt', 'updatedAt'],
    indexes: ['agentId'],
  },
  StandingOrder: {
    fields: ['id', 'agentId', 'order', 'priority', 'enabled', 'createdAt'],
    indexes: ['agentId'],
  },
  TaskExecution: {
    fields: ['id', 'jobId', 'type', 'status', 'result', 'errorMessage', 'startedAt', 'completedAt'],
    indexes: ['type', 'status', 'startedAt'],
  },
  ChannelConfig: {
    fields: ['id', 'channelType', 'config', 'enabled', 'connectedAt'],
    indexes: ['channelType_unique'],
  },
  OpenCodeSession: {
    fields: ['id', 'sessionId', 'model', 'provider', 'prompt', 'status', 'filesTouched', 'toolsUsed', 'createdAt', 'updatedAt'],
    indexes: ['status', 'createdAt', 'sessionId_unique'],
  },
  MCPBridgeConfig: {
    fields: ['id', 'direction', 'toolName', 'enabled', 'config', 'updatedAt'],
    indexes: ['direction_toolName_unique', 'direction'],
  },
}

async function getNeo4jSchema() {
  const result = {
    labels: [] as string[],
    relationshipTypes: [] as string[],
    nodeCount: 0,
    relationshipCount: 0,
  }

  try {
    const { safeSession } = await import('@/lib/neo4j')
    let session: import('neo4j-driver').Session | null = null
    try {
      session = await safeSession()
    } catch {
      return result
    }
    try {
      const labelsResult = await session.run('CALL db.labels()')
      result.labels = labelsResult.records.map(r => r.get(0) as string)

      const relResult = await session.run('CALL db.relationshipTypes()')
      result.relationshipTypes = relResult.records.map(r => r.get(0) as string)

      const countResult = await session.run('MATCH (n) RETURN count(n) AS nodeCount')
      const nodeCount = countResult.records[0]?.get('nodeCount')
      result.nodeCount = typeof nodeCount?.toNumber === 'function' ? nodeCount.toNumber() : (nodeCount ?? 0)

      const relCountResult = await session.run('MATCH ()-[r]->() RETURN count(r) AS relCount')
      const relCount = relCountResult.records[0]?.get('relCount')
      result.relationshipCount = typeof relCount?.toNumber === 'function' ? relCount.toNumber() : (relCount ?? 0)
    } finally {
      await session?.close().catch(() => {})
    }
  } catch (err) {
    console.warn('[Schema API] Neo4j query failed:', err instanceof Error ? err.message : String(err))
  }

  return result
}

async function getQdrantCollections() {
  const collections: Array<{
    name: string
    pointCount: number
    vectorSize: number
    status: string
  }> = []

  try {
    const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333'
    const listRes = await fetch(`${qdrantUrl}/collections`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!listRes.ok) return collections

    const listData = await listRes.json()
    const collectionNames: string[] = (listData.result?.collections || []).map(
      (c: { name: string }) => c.name
    )

    for (const name of collectionNames) {
      try {
        const detailRes = await fetch(`${qdrantUrl}/collections/${name}`, {
          signal: AbortSignal.timeout(5000),
        })
        if (detailRes.ok) {
          const detailData = await detailRes.json()
          const info = detailData.result
          collections.push({
            name,
            pointCount: info?.points_count ?? info?.pointCount ?? 0,
            vectorSize: info?.config?.params?.vectors?.size ?? info?.config?.params?.vectors?.vector?.size ?? 0,
            status: info?.status ?? 'unknown',
          })
        }
      } catch {
        collections.push({ name, pointCount: 0, vectorSize: 0, status: 'unreachable' })
      }
    }
  } catch (err) {
    console.warn('[Schema API] Qdrant query failed:', err instanceof Error ? err.message : String(err))
    collections.push(
      { name: 'theopus_documents', pointCount: 0, vectorSize: 1536, status: 'unreachable' },
      { name: 'theopus_chunks', pointCount: 0, vectorSize: 1536, status: 'unreachable' },
    )
  }

  return collections
}

async function getPrismaModelCounts() {
  const counts: Record<string, number> = {}
  try {
    const modelAccessors: Record<string, () => Promise<number>> = {
      JobQueue: () => db.jobQueue.count(),
      DailyTokenUsage: () => db.dailyTokenUsage.count(),
      DailyTokenByProvider: () => db.dailyTokenByProvider.count(),
      DailyTokenByProviderSlot: () => db.dailyTokenByProviderSlot.count(),
      DailyTokenByProviderModel: () => db.dailyTokenByProviderModel.count(),
      LocalEntity: () => db.localEntity.count(),
      LocalRelationship: () => db.localRelationship.count(),
      LocalResolvedEntity: () => db.localResolvedEntity.count(),
      AgentProfile: () => db.agentProfile.count(),
      AgentSession: () => db.agentSession.count(),
      LearningLog: () => db.learningLog.count(),
      AgentInsight: () => db.agentInsight.count(),
      AgentCorrection: () => db.agentCorrection.count(),
      AgentPreference: () => db.agentPreference.count(),
      AgentSkill: () => db.agentSkill.count(),
      ToolPermission: () => db.toolPermission.count(),
      KnowledgeAccessPolicy: () => db.knowledgeAccessPolicy.count(),
      CronJob: () => db.cronJob.count(),
      Webhook: () => db.webhook.count(),
      StandingOrder: () => db.standingOrder.count(),
      TaskExecution: () => db.taskExecution.count(),
      ChannelConfig: () => db.channelConfig.count(),
      OpenCodeSession: () => db.openCodeSession.count(),
      MCPBridgeConfig: () => db.mCPBridgeConfig.count(),
    }

    for (const [model, countFn] of Object.entries(modelAccessors)) {
      try {
        counts[model] = await countFn()
      } catch {
        counts[model] = -1
      }
    }
  } catch (err) {
    console.warn('[Schema API] Prisma count failed:', err instanceof Error ? err.message : String(err))
  }

  return counts
}

export async function GET() {
  try {
    const [neo4jSchema, qdrantCollections, prismaCounts] = await Promise.all([
      getNeo4jSchema(),
      getQdrantCollections(),
      getPrismaModelCounts(),
    ])

    const modelNames = Object.keys(PRISMA_MODELS)
    const details: Record<string, { fields: string[]; indexes: string[]; rowCount: number }> = {}
    for (const name of modelNames) {
      details[name] = {
        ...PRISMA_MODELS[name],
        rowCount: prismaCounts[name] ?? -1,
      }
    }

    return NextResponse.json({
      prisma: {
        models: modelNames,
        details,
      },
      neo4j: neo4jSchema,
      qdrant: {
        collections: qdrantCollections,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to fetch schema info', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
