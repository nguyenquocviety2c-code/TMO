/**
 * Knowledge Search Tool — Agent tool for searching Knowledge Base
 *
 * POST — Search knowledge base using existing RAG pipeline
 * Body: { query: string, topK?: number, expandGraph?: boolean }
 */

import { NextRequest, NextResponse } from 'next/server'
import { agentKnowledgeSearch } from '@/lib/knowledge-bridge'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { query, topK, expandGraph } = body

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'query is required' },
        { status: 400 }
      )
    }

    const result = await agentKnowledgeSearch(query, {
      topK: topK || 5,
      expandGraph: expandGraph || false,
    })

    return NextResponse.json({
      results: result.results,
      answer: result.answer,
      query,
      totalResults: result.results.length,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Knowledge search failed', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
