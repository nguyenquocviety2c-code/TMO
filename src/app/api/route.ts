/**
 * Root API — Service info and available endpoints
 *
 * Architecture:
 *   SQLite (buffer) → Qdrant (vector+document) + Neo4j (graph)
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    name: 'GraphRAG Knowledge Base API',
    version: '1.0.0',
    description: 'Hybrid GraphRAG system combining Neo4j Graph, Qdrant Vector Store, and LLM APIs',
    architecture: 'self-contained (Vercel-compatible)',
    endpoints: {
      health: '/api/health',
      query: {
        post: 'POST /api/query — hybrid query (vector + graph + LLM answer + meta-cognitive reasoning)',
        embedStatus: 'GET /api/query?action=embed-status',
        stats: 'GET /api/query?action=stats',
        graphExplore: 'GET /api/query?action=graph-explore&entity=...',
        graphPath: 'GET /api/query?action=graph-path&from=...&to=...',
      },
      ingestion: {
        upload: 'POST /api/ingestion/upload — upload PDF files',
        listDocuments: 'GET /api/ingestion/upload — list documents',
        process: 'POST /api/ingestion/process — run ingestion pipeline',
        processStatus: 'GET /api/ingestion/process?documentId=...',
        entities: 'GET /api/ingestion/entities — list extracted entities',
        relationships: 'GET /api/ingestion/relationships — list extracted relationships',
      },
      setup: {
        neo4j: '/api/setup/neo4j',
        qdrant: '/api/setup/qdrant',
      },
    },
    storage: {
      primary: 'Qdrant (vector database + document metadata)',
      graph: 'Neo4j (AuraDB Cloud / Desktop)',
      buffer: 'SQLite (local buffer for entities, relationships, job queue, token tracking)',
      llm: 'NVIDIA NIM (4 keys × 4 docs, auto mode, single provider)',
    },
  })
}
