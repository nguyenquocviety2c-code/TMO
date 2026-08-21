/**
 * Relationships API — Query extracted relationships from Neo4j (graph) + SQLite (buffer)
 *
 * GET /api/ingestion/relationships — list extracted relationships with filters
 * Architecture: SQLite (buffer) → Qdrant (vector+document) + Neo4j (graph)
 *
 * Strategy:
 *   1. Try Neo4j via readCypher for graph-queryable relationship edges (synced relationships)
 *   2. Fall back to SQLite buffer (db.localRelationship) if Neo4j is unavailable
 *   3. Enrich results with source/target entity names
 *
 * Filters:
 *   ?documentId=  — filter by document
 *   ?type=        — filter by relationship type
 *   ?limit=       — pagination limit (default 100)
 *   ?offset=      — pagination offset (default 0)
 *
 * Enriches results with source/target entity names for display.
 */

import { NextRequest, NextResponse } from 'next/server'
import { readCypher } from '@/lib/neo4j'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** Normalized relationship shape for API response */
interface RelationshipRow {
  id: string
  document_id: string | null
  source_entity_id: string | null
  target_entity_id: string | null
  relationship_type: string
  description: string | null
  confidence_score: number
  source: string
  created_at: string
  source_entity_name?: string | null
  target_entity_name?: string | null
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const documentId = searchParams.get('documentId')
    const type = searchParams.get('type')
    const limit = parseInt(searchParams.get('limit') || '100', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    // Clamp limit to reasonable range
    const clampedLimit = Math.min(Math.max(limit, 1), 500)

    // ========== PRIMARY: Query Neo4j for graph relationships ==========
    let relationships: RelationshipRow[] = []
    let total = 0
    let neo4jAvailable = false

    try {
      // Build Cypher WHERE clauses for relationship filtering
      const conditions: string[] = []
      const params: Record<string, unknown> = {}

      if (documentId) {
        // Support both snake_case (document_id) and camelCase (documentId) properties
        conditions.push('(r.document_id = $documentId OR r.documentId = $documentId)')
        params.documentId = documentId
      }
      if (type) {
        conditions.push('type(r) = $relType')
        params.relType = type
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      // Count query
      const countResults = await readCypher<{ total: number }>(
        `MATCH ()-[r]->() ${whereClause} RETURN count(r) AS total`,
        params
      )
      total = typeof countResults[0]?.total === 'number'
        ? countResults[0].total
        : Number(countResults[0]?.total || 0)

      // Data query with pagination — return relationship properties + connected node names
      const dataResults = await readCypher<Record<string, unknown>>(
        `MATCH (src)-[r]->(tgt) ${whereClause} RETURN r, COALESCE(src.entity_name, src.name) AS src_name, COALESCE(tgt.entity_name, tgt.name) AS tgt_name ORDER BY r.created_at DESC SKIP $skip LIMIT $limit`,
        { ...params, skip: offset, limit: clampedLimit }
      )

      relationships = dataResults.map((row) => {
        const r = row.r as Record<string, unknown>
        return {
          id: String(r.id || ''),
          document_id: r.document_id ? String(r.document_id) : null,
          source_entity_id: r.source_entity_id ? String(r.source_entity_id) : null,
          target_entity_id: r.target_entity_id ? String(r.target_entity_id) : null,
          relationship_type: String(r.relationship_type || type || ''),
          description: r.description ? String(r.description) : null,
          confidence_score: typeof r.confidence_score === 'number' ? r.confidence_score : Number(r.confidence_score || 0.5),
          source: String(r.source || 'unknown'),
          created_at: r.created_at ? String(r.created_at) : new Date().toISOString(),
          source_entity_name: row.src_name ? String(row.src_name) : null,
          target_entity_name: row.tgt_name ? String(row.tgt_name) : null,
        }
      })

      neo4jAvailable = true
    } catch (err) {
      console.warn('[Relationships] Neo4j query failed, falling back to SQLite buffer:', err instanceof Error ? err.message : String(err))
    }

    // ========== FALLBACK: Query SQLite buffer ==========
    if (!neo4jAvailable) {
      try {
        const where: Record<string, unknown> = {}
        if (documentId) where.documentId = documentId
        if (type) where.relationshipType = type

        const [sqliteRelationships, sqliteTotal] = await Promise.all([
          db.localRelationship.findMany({
            where: Object.keys(where).length > 0 ? where : undefined,
            orderBy: { createdAt: 'desc' },
            skip: offset,
            take: clampedLimit,
          }),
          db.localRelationship.count({
            where: Object.keys(where).length > 0 ? where : undefined,
          }),
        ])

        relationships = sqliteRelationships.map((r) => ({
          id: r.id,
          document_id: r.documentId,
          source_entity_id: r.sourceEntityId,
          target_entity_id: r.targetEntityId,
          relationship_type: r.relationshipType,
          description: r.description,
          confidence_score: r.confidenceScore,
          source: r.source,
          created_at: r.createdAt.toISOString(),
          source_entity_name: r.sourceEntityName || null,
          target_entity_name: r.targetEntityName || null,
        }))
        total = sqliteTotal
      } catch (err) {
        console.error('[Relationships] SQLite buffer query also failed:', err)
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Failed to fetch relationships (both Neo4j and SQLite failed)' },
          { status: 503 }
        )
      }
    }

    // ========== ENRICH: Fill in entity names if missing ==========
    // For Neo4j results that didn't get names from the MATCH pattern,
    // or SQLite results missing sourceEntityName/targetEntityName
    if (relationships.length > 0) {
      const missingSourceNames = relationships.filter(r => r.source_entity_id && !r.source_entity_name)
      const missingTargetNames = relationships.filter(r => r.target_entity_id && !r.target_entity_name)
      const needsEnrichment = missingSourceNames.length > 0 || missingTargetNames.length > 0

      if (needsEnrichment) {
        const sourceIds = missingSourceNames.map(r => r.source_entity_id).filter(Boolean) as string[]
        const targetIds = missingTargetNames.map(r => r.target_entity_id).filter(Boolean) as string[]
        const allEntityIds = [...new Set([...sourceIds, ...targetIds])]

        if (allEntityIds.length > 0) {
          const entityMap = new Map<string, string>()

          // Try Neo4j first for entity names
          try {
            const entityResults = await readCypher<Record<string, unknown>>(
              `MATCH (e) WHERE e.id IN $ids RETURN e.id AS id, COALESCE(e.entity_name, e.name) AS name`,
              { ids: allEntityIds }
            )
            for (const row of entityResults) {
              if (row.id && row.name) {
                entityMap.set(String(row.id), String(row.name))
              }
            }
          } catch {
            // Neo4j enrichment failed — try SQLite buffer
          }

          // If Neo4j didn't provide all names, try SQLite buffer
          if (entityMap.size < allEntityIds.length) {
            try {
              const missingIds = allEntityIds.filter(id => !entityMap.has(id))
              if (missingIds.length > 0) {
                const sqliteEntities = await db.localEntity.findMany({
                  where: { id: { in: missingIds } },
                  select: { id: true, entityName: true },
                })
                for (const e of sqliteEntities) {
                  entityMap.set(e.id, e.entityName)
                }
              }
            } catch {
              // SQLite enrichment also failed — continue with what we have
            }
          }

          // Apply enriched names to relationships
          relationships = relationships.map(r => ({
            ...r,
            source_entity_name: r.source_entity_name || (r.source_entity_id ? entityMap.get(r.source_entity_id) || null : null),
            target_entity_name: r.target_entity_name || (r.target_entity_id ? entityMap.get(r.target_entity_id) || null : null),
          }))
        }
      }
    }

    return NextResponse.json({
      relationships,
      total,
      limit: clampedLimit,
      offset,
      source: neo4jAvailable ? 'neo4j' : 'sqlite',
    })
  } catch (error) {
    console.error('[Relationships] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch relationships' },
      { status: 500 }
    )
  }
}
