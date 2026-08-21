/**
 * Neo4j Setup API — Schema initialization and cleanup
 *
 * Architecture:
 *   SQLite (buffer) → Qdrant (vector+document) + Neo4j (graph)
 *
 * - POST: Initialize Neo4j constraints and indexes
 * - GET: Check Neo4j connection status
 * - DELETE ?action=clean: Clean up all Neo4j data and re-sync
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkNeo4jHealth, initializeNeo4jSchema, getNeo4jDriver, safeSession } from '@/lib/neo4j'
import { listDocuments, updateDocumentStatus } from '@/lib/qdrant'
import type { DocumentPayload } from '@/lib/qdrant'

export const dynamic = 'force-dynamic'

// Increase max duration for AuraDB schema init (can take 10-30 seconds)
export const maxDuration = 300

/**
 * POST /api/setup/neo4j
 * Initialize Neo4j constraints and indexes
 */
export async function POST() {
  try {
    const health = await checkNeo4jHealth()

    if (!health.connected) {
      return NextResponse.json(
        { success: false, error: 'Cannot connect to Neo4j. Check your credentials and ensure the database is running.' },
        { status: 500 }
      )
    }

    const schema = await initializeNeo4jSchema()

    return NextResponse.json({
      success: true,
      message: `Neo4j schema initialized: ${schema.constraints} constraints, ${schema.indexes} indexes`,
      health,
      schema,
    })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    )
  }
}

/**
 * GET /api/setup/neo4j
 * Check Neo4j connection status
 */
export async function GET() {
  const health = await checkNeo4jHealth()
  return NextResponse.json({ health })
}

/**
 * DELETE /api/setup/neo4j?action=clean
 * Clean up all Neo4j data and re-sync from Qdrant + SQLite buffer.
 * Fixes the cross-product relationship bug by deleting inflated relationships
 * and re-syncing with the correct ID-based approach.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    if (action !== 'clean') {
      return NextResponse.json({ error: 'Use ?action=clean to clean up Neo4j data' }, { status: 400 })
    }

    const driver = await getNeo4jDriver()
    if (!driver) {
      return NextResponse.json({ error: 'Neo4j not connected' }, { status: 500 })
    }

    // Step 1: Count existing data before cleanup
    let countSession: import('neo4j-driver').Session | null = null
    try { countSession = await safeSession() } catch { return NextResponse.json({ error: 'Neo4j not connected' }, { status: 500 }) }
    let beforeNodes = 0; let beforeRels = 0
    try {
      const nodeResult = await countSession.executeRead(tx => tx.run('MATCH (n) RETURN count(n) AS cnt'))
      beforeNodes = Number(nodeResult.records[0]?.get('cnt') ?? 0)
      const relResult = await countSession.executeRead(tx => tx.run('MATCH ()-[r]->() RETURN count(r) AS cnt'))
      beforeRels = Number(relResult.records[0]?.get('cnt') ?? 0)
    } finally { await countSession?.close().catch(() => {}) }

    console.log(`[Neo4j Clean] Before: ${beforeNodes} nodes, ${beforeRels} relationships`)

    // Step 2: Delete ALL nodes and relationships
    let cleanSession: import('neo4j-driver').Session | null = null
    try { cleanSession = await safeSession() } catch { return NextResponse.json({ error: 'Neo4j not connected' }, { status: 500 }) }
    try {
      await cleanSession.executeWrite(tx => tx.run('MATCH (n) DETACH DELETE n'))
      console.log('[Neo4j Clean] All nodes and relationships deleted')
    } finally { await cleanSession?.close().catch(() => {}) }

    // Step 3: Reset Neo4j step for all documents that had Neo4j data
    // Read documents from Qdrant and reset processing_steps
    const targetStatuses = ['indexed', 'partial', 'extracting', 'extracted']
    let resetCount = 0

    for (const status of targetStatuses) {
      const { documents: docs } = await listDocuments({ status, limit: 1000 })
      for (const doc of docs) {
        const steps = doc.payload.processing_steps as Array<{ step: string; status: string; timestamp: string }> | null
        if (steps && Array.isArray(steps)) {
          // Check if there's a neo4j step to reset
          const hasNeo4jStep = steps.some(s => s.step === 'neo4j')
          if (hasNeo4jStep) {
            // Reset neo4j step to pending
            const updatedSteps = steps.map(s =>
              s.step === 'neo4j'
                ? { ...s, status: 'pending', timestamp: new Date().toISOString() }
                : s
            )
            await updateDocumentStatus(doc.id, {
              processing_steps: updatedSteps as DocumentPayload['processing_steps'],
            })
            resetCount++
          }
        }
      }
    }

    // Step 4: Verify cleanup
    let verifySession: import('neo4j-driver').Session | null = null
    try { verifySession = await safeSession() } catch { /* already cleaned */ }
    let afterNodes = 0; let afterRels = 0
    try {
      const nodeResult = await verifySession!.executeRead(tx => tx.run('MATCH (n) RETURN count(n) AS cnt'))
      afterNodes = Number(nodeResult.records[0]?.get('cnt') ?? 0)
      const relResult = await verifySession!.executeRead(tx => tx.run('MATCH ()-[r]->() RETURN count(r) AS cnt'))
      afterRels = Number(relResult.records[0]?.get('cnt') ?? 0)
    } finally { await verifySession?.close().catch(() => {}) }

    console.log(`[Neo4j Clean] After: ${afterNodes} nodes, ${afterRels} relationships`)

    return NextResponse.json({
      success: true,
      message: `Cleaned Neo4j: ${beforeNodes}→${afterNodes} nodes, ${beforeRels}→${afterRels} relationships. Reset ${resetCount} documents for re-sync.`,
      before: { nodes: beforeNodes, relationships: beforeRels },
      after: { nodes: afterNodes, relationships: afterRels },
      documentsReset: resetCount,
    })
  } catch (err) {
    console.error('[Neo4j Clean] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Neo4j cleanup failed' },
      { status: 500 }
    )
  }
}
