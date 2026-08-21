/**
 * Knowledge Graph Tool — Agent tool for graph queries
 *
 * POST /api/openclaw/tools/knowledge-graph
 *
 * Actions:
 * - "explore": Find entity and its neighbors (limit 20)
 *   Body: { action: "explore", entityName: string }
 *
 * - "path": Find shortest path between two entities
 *   Body: { action: "path", fromEntity: string, toEntity: string }
 *
 * - "query": Execute read-only Cypher
 *   Body: { action: "query", cypher: string, params?: Record<string, unknown> }
 */

import { NextRequest, NextResponse } from 'next/server'
import { agentGraphQuery } from '@/lib/knowledge-bridge'

export const dynamic = 'force-dynamic'

// Blocked keywords for raw Cypher queries
const BLOCKED_CYPHER_KEYWORDS = [
  'CREATE', 'DELETE', 'DROP', 'REMOVE', 'SET', 'MERGE',
]

function isReadOnlyCypher(cypher: string): boolean {
  const upperWords = cypher.trim().toUpperCase().split(/[\s(;,]+/)
  for (const word of upperWords) {
    if (BLOCKED_CYPHER_KEYWORDS.includes(word)) return false
  }
  return true
}

async function exploreEntity(entityName: string) {
  try {
    const { safeSession } = await import('@/lib/neo4j')
    let session: import('neo4j-driver').Session | null = null
    try {
      session = await safeSession()
    } catch {
      return { error: 'Neo4j driver not available' }
    }
    try {
      // First, find the entity itself (even if it has no relationships)
      const entityResult = await session.run(
        `MATCH (center) WHERE center.name = $name OR center.entity_name = $name
         RETURN center LIMIT 1`,
        { name: entityName },
        { timeout: 5000 }
      )

      if (entityResult.records.length === 0) {
        return { entity: null, neighbors: [], message: `Entity "${entityName}" not found in graph` }
      }

      const center = entityResult.records[0].get('center')
      const centerProps = center.properties as Record<string, unknown>
      const entityInfo = {
        name: (centerProps.entity_name as string) || (centerProps.name as string) || '',
        type: (centerProps.entity_type as string) || '',
        domain: (centerProps.domain as string) || '',
        description: (centerProps.description as string) || '',
        labels: center.labels as string[],
      }

      // Find the entity's direct neighbors (optional — entity may have no relationships)
      const result = await session.run(
        `MATCH (center {name: $name})-[r]-(neighbor)
         RETURN type(r) AS relType, neighbor,
                CASE WHEN startNode(r).name = $name THEN 'outgoing' ELSE 'incoming' END AS direction
         LIMIT 20`,
        { name: entityName },
        { timeout: 5000 }
      )

      if (result.records.length === 0) {
        // Try entity_name alias for relationships
        const altResult = await session.run(
          `MATCH (center {entity_name: $name})-[r]-(neighbor)
           RETURN type(r) AS relType, neighbor,
                  CASE WHEN startNode(r).entity_name = $name THEN 'outgoing' ELSE 'incoming' END AS direction
           LIMIT 20`,
          { name: entityName },
          { timeout: 5000 }
        )

        if (altResult.records.length === 0) {
          // Entity exists but has no relationships
          return { entity: entityInfo, neighbors: [], neighborCount: 0 }
        }

        const neighbors = altResult.records.map(record => {
          const neighbor = record.get('neighbor')
          const neighborProps = neighbor.properties as Record<string, unknown>
          return {
            name: (neighborProps.entity_name as string) || (neighborProps.name as string) || '',
            type: (neighborProps.entity_type as string) || '',
            domain: (neighborProps.domain as string) || '',
            relType: record.get('relType') as string,
            direction: record.get('direction') as string,
          }
        })

        return { entity: entityInfo, neighbors, neighborCount: neighbors.length }
      }

      const neighbors = result.records.map(record => {
        const neighbor = record.get('neighbor')
        const neighborProps = neighbor.properties as Record<string, unknown>
        return {
          name: (neighborProps.entity_name as string) || (neighborProps.name as string) || '',
          type: (neighborProps.entity_type as string) || '',
          domain: (neighborProps.domain as string) || '',
          relType: record.get('relType') as string,
          direction: record.get('direction') as string,
        }
      })

      return { entity: entityInfo, neighbors, neighborCount: neighbors.length }
    } finally {
      await session?.close().catch(() => {})
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

async function findPath(fromEntity: string, toEntity: string) {
  try {
    const { safeSession } = await import('@/lib/neo4j')
    let session: import('neo4j-driver').Session | null = null
    try {
      session = await safeSession()
    } catch {
      return { error: 'Neo4j driver not available' }
    }
    try {
      const result = await session.run(
        `MATCH (a {name: $fromName}), (b {name: $toName})
         MATCH p = shortestPath((a)-[*..10]-(b))
         RETURN p`,
        { fromName: fromEntity, toName: toEntity },
        { timeout: 5000 }
      )

      if (result.records.length === 0) {
        // Try with entity_name alias
        const altResult = await session.run(
          `MATCH (a {entity_name: $fromName}), (b {entity_name: $toName})
           MATCH p = shortestPath((a)-[*..10]-(b))
           RETURN p`,
          { fromName: fromEntity, toName: toEntity },
          { timeout: 5000 }
        )

        if (altResult.records.length === 0) {
          return { path: null, message: `No path found between "${fromEntity}" and "${toEntity}"` }
        }

        const path = altResult.records[0].get('p')
        const nodes = (path.segments as Array<{ start: { properties: Record<string, unknown> }; end: { properties: Record<string, unknown> }; relationship: { type: string } }>).flatMap(
          (seg, i) => {
            const startNode = {
              name: (seg.start.properties.entity_name as string) || (seg.start.properties.name as string) || '',
              type: (seg.start.properties.entity_type as string) || '',
            }
            const endNode = {
              name: (seg.end.properties.entity_name as string) || (seg.end.properties.name as string) || '',
              type: (seg.end.properties.entity_type as string) || '',
            }
            const edge = { source: startNode.name, type: seg.relationship.type, target: endNode.name }
            return i === 0 ? [startNode, edge, endNode] : [edge, endNode]
          }
        )

        return { path: { nodes: nodes.filter(n => !('type' in n && 'source' in n && 'target' in n)), edges: nodes.filter(n => 'type' in n && 'source' in n && 'target' in n), length: path.length } }
      }

      const path = result.records[0].get('p')
      const segments = path.segments as Array<{ start: { properties: Record<string, unknown>; labels: string[] }; end: { properties: Record<string, unknown>; labels: string[] }; relationship: { type: string; properties: Record<string, unknown> } }>

      const nodeSet = new Map<string, { name: string; type: string }>()
      const edges: Array<{ source: string; type: string; target: string }> = []

      for (const seg of segments) {
        const startName = (seg.start.properties.entity_name as string) || (seg.start.properties.name as string) || ''
        const startType = (seg.start.properties.entity_type as string) || ''
        const endName = (seg.end.properties.entity_name as string) || (seg.end.properties.name as string) || ''
        const endType = (seg.end.properties.entity_type as string) || ''

        nodeSet.set(startName, { name: startName, type: startType })
        nodeSet.set(endName, { name: endName, type: endType })
        edges.push({ source: startName, type: seg.relationship.type, target: endName })
      }

      return {
        path: {
          nodes: Array.from(nodeSet.values()),
          edges,
          length: edges.length,
        },
      }
    } finally {
      await session?.close().catch(() => {})
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body

    if (!action) {
      return NextResponse.json(
        { error: 'action is required ("explore", "path", or "query")' },
        { status: 400 }
      )
    }

    switch (action) {
      case 'explore': {
        const { entityName } = body
        if (!entityName || typeof entityName !== 'string') {
          return NextResponse.json(
            { error: 'entityName is required for explore action' },
            { status: 400 }
          )
        }
        const result = await exploreEntity(entityName)
        if (result.error) {
          return NextResponse.json({ error: result.error }, { status: 500 })
        }
        return NextResponse.json(result)
      }

      case 'path': {
        const { fromEntity, toEntity } = body
        if (!fromEntity || !toEntity) {
          return NextResponse.json(
            { error: 'fromEntity and toEntity are required for path action' },
            { status: 400 }
          )
        }
        const result = await findPath(fromEntity, toEntity)
        if (result.error) {
          return NextResponse.json({ error: result.error }, { status: 500 })
        }
        return NextResponse.json(result)
      }

      case 'query': {
        const { cypher, params } = body
        if (!cypher || typeof cypher !== 'string') {
          return NextResponse.json(
            { error: 'cypher is required for query action' },
            { status: 400 }
          )
        }

        // Safety: validate read-only
        if (!isReadOnlyCypher(cypher)) {
          return NextResponse.json(
            { error: 'Only MATCH queries are allowed. Write operations are blocked.' },
            { status: 403 }
          )
        }

        // Auto-add LIMIT if not present
        let safeCypher = cypher.trim()
        if (!safeCypher.toUpperCase().includes('LIMIT')) {
          safeCypher += ' LIMIT 20'
        }

        const result = await agentGraphQuery(safeCypher, params)
        return NextResponse.json({
          records: result.records,
          count: result.count,
          query: safeCypher,
        })
      }

      default:
        return NextResponse.json(
          { error: `Unknown action "${action}". Supported: explore, path, query` },
          { status: 400 }
        )
    }
  } catch (err) {
    return NextResponse.json(
      { error: 'Knowledge graph tool failed', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
