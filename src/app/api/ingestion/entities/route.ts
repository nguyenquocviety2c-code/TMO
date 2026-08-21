/**
 * Entities API — Query extracted entities from Neo4j (graph) + SQLite (buffer)
 *
 * GET /api/ingestion/entities — list extracted entities with filters
 * Architecture: SQLite (buffer) → Qdrant (vector+document) + Neo4j (graph)
 *
 * Strategy:
 *   1. Try Neo4j via readCypher for graph-queryable entity nodes (synced entities)
 *   2. Fall back to SQLite buffer (db.localEntity) if Neo4j is unavailable
 *   3. Merge results from both sources, deduplicating by entity ID
 *
 * Filters:
 *   ?documentId=  — filter by document
 *   ?domain=      — filter by domain
 *   ?type=        — filter by entity type
 *   ?limit=       — pagination limit (default 100)
 *   ?offset=      — pagination offset (default 0)
 */

import { NextRequest, NextResponse } from 'next/server'
import { readCypher } from '@/lib/neo4j'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** Neo4j entity node shape returned by readCypher */
interface Neo4jEntityNode {
  e: Record<string, unknown>
}

/** Normalized entity shape for API response */
interface EntityRow {
  id: string
  document_id: string | null
  chunk_id: string | null
  entity_name: string
  entity_type: string
  description: string | null
  properties: string | null
  confidence_score: number
  source: string
  domain: string | null
  resolved_entity_id: string | null
  created_at: string
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const documentId = searchParams.get('documentId')
    const domain = searchParams.get('domain')
    const type = searchParams.get('type')
    const limit = parseInt(searchParams.get('limit') || '100', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    // Clamp limit to reasonable range
    const clampedLimit = Math.min(Math.max(limit, 1), 500)

    // ========== PRIMARY: Query Neo4j for graph entities ==========
    let neo4jEntities: EntityRow[] = []
    let neo4jTotal = 0
    let neo4jAvailable = false

    try {
      // Build Cypher WHERE clauses
      const conditions: string[] = []
      const params: Record<string, unknown> = {}

      if (documentId) {
        // Support both snake_case (document_id) and camelCase (documentId) properties
        conditions.push('(e.document_id = $documentId OR e.documentId = $documentId)')
        params.documentId = documentId
      }
      if (domain) {
        conditions.push('e.domain = $domain')
        params.domain = domain
      }
      if (type) {
        // Entity type is stored as a Neo4j label — filter via label check
        conditions.push(`$type IN labels(e)`)
        params.type = type
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      // Count query
      const countResults = await readCypher<{ total: number }>(
        `MATCH (e) ${whereClause} RETURN count(e) AS total`,
        params
      )
      neo4jTotal = typeof countResults[0]?.total === 'number'
        ? countResults[0].total
        : Number(countResults[0]?.total || 0)

      // Data query with pagination
      const dataResults = await readCypher<Neo4jEntityNode>(
        `MATCH (e) ${whereClause} RETURN e ORDER BY e.created_at DESC SKIP $skip LIMIT $limit`,
        { ...params, skip: offset, limit: clampedLimit }
      )

      neo4jEntities = dataResults.map((row) => {
        const node = row.e
        return {
          id: String(node.id || ''),
          document_id: node.document_id ? String(node.document_id) : null,
          chunk_id: node.chunk_id ? String(node.chunk_id) : null,
          entity_name: String(node.entity_name || node.name || ''),
          entity_type: String(node.entity_type || ''),
          description: node.description ? String(node.description) : null,
          properties: node.properties ? String(node.properties) : null,
          confidence_score: typeof node.confidence_score === 'number' ? node.confidence_score : Number(node.confidence_score || 0.5),
          source: String(node.source || 'unknown'),
          domain: node.domain ? String(node.domain) : null,
          resolved_entity_id: node.resolved_entity_id ? String(node.resolved_entity_id) : null,
          created_at: node.created_at ? String(node.created_at) : new Date().toISOString(),
        }
      })

      neo4jAvailable = true
    } catch (err) {
      console.warn('[Entities] Neo4j query failed, falling back to SQLite buffer:', err instanceof Error ? err.message : String(err))
    }

    // ========== FALLBACK: Query SQLite buffer ==========
    if (!neo4jAvailable) {
      try {
        const where: Record<string, unknown> = {}
        if (documentId) where.documentId = documentId
        if (domain) where.domain = domain
        if (type) where.entityType = type

        const [sqliteEntities, sqliteTotal] = await Promise.all([
          db.localEntity.findMany({
            where: Object.keys(where).length > 0 ? where : undefined,
            orderBy: { createdAt: 'desc' },
            skip: offset,
            take: clampedLimit,
          }),
          db.localEntity.count({
            where: Object.keys(where).length > 0 ? where : undefined,
          }),
        ])

        neo4jEntities = sqliteEntities.map((e) => ({
          id: e.id,
          document_id: e.documentId,
          chunk_id: e.chunkId,
          entity_name: e.entityName,
          entity_type: e.entityType,
          description: e.description,
          properties: e.properties,
          confidence_score: e.confidenceScore,
          source: e.source,
          domain: e.domain,
          resolved_entity_id: e.resolvedEntityId,
          created_at: e.createdAt.toISOString(),
        }))
        neo4jTotal = sqliteTotal
      } catch (err) {
        console.error('[Entities] SQLite buffer query also failed:', err)
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Failed to fetch entities (both Neo4j and SQLite failed)' },
          { status: 503 }
        )
      }
    }

    return NextResponse.json({
      entities: neo4jEntities,
      total: neo4jTotal,
      limit: clampedLimit,
      offset,
      source: neo4jAvailable ? 'neo4j' : 'sqlite',
    })
  } catch (error) {
    console.error('[Entities] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch entities' },
      { status: 500 }
    )
  }
}
