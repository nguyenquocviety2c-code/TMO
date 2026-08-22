/**
 * Memory Archive API — list COLD-tier MemoryArchive summaries
 *
 * GET /api/memory/archive?agentId=xxx
 *   Optional: &page=1&pageSize=25
 *   Optional: &domain=user|work|meta
 *
 * Returns the LLM-compressed cold-tier summaries (MemoryArchive table).
 * Each row summarizes 5-10 source memories that decayed below threshold
 * and were grouped by Qdrant similarity (≥0.85).
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

const MAX_PAGE_SIZE = 100

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agentId')
    const domain = searchParams.get('domain') || undefined
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(searchParams.get('pageSize') || '25', 10)))

    if (!agentId) {
      return NextResponse.json({ error: 'agentId is required' }, { status: 400 })
    }

    const skip = (page - 1) * pageSize
    const where = { agentId, ...(domain ? { domain } : {}) }

    const [rows, total] = await Promise.all([
      db.memoryArchive.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip,
      }),
      db.memoryArchive.count({ where }),
    ])

    return NextResponse.json({
      agentId,
      page,
      pageSize,
      total,
      archives: rows.map(a => ({
        id: a.id,
        originalIds: a.originalIds,
        summaryContent: a.summaryContent,
        domain: a.domain,
        importance: a.importance,
        sourceCount: a.sourceCount,
        qdrantPointId: a.qdrantPointId,
        embeddingModel: a.embeddingModel,
        expiresAt: a.expiresAt?.toISOString() ?? null,
        createdAt: a.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[MemoryArchive API] GET error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
