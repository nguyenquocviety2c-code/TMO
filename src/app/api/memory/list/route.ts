/**
 * Memory List API — paginated flat list of memories (NOT semantic search)
 *
 * GET /api/memory/list?agentId=xxx
 *   Optional: &tier=warm|cold|hot|all (default: all)
 *   Optional: &category=insight|fact|preference|correction|procedure|user_info
 *   Optional: &domain=user|work|meta
 *   Optional: &page=1&pageSize=25
 *   Optional: &search=<text substring>
 *
 * Returns memories grouped by tier:
 *   - hot:   WorkingMemory rows (current session, expires soon)
 *   - warm:  AgentMemory where tier='warm' AND isActive=true
 *   - cold:  AgentMemory where tier='cold' OR isActive=false
 *
 * WHY THIS EXISTS:
 *   Existing GET /api/memory only does semantic recall (requires a query).
 *   The Memory tab UI needs a flat list to browse all memories per agent.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 100

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agentId')
    const tier = searchParams.get('tier') || 'all'
    const category = searchParams.get('category') || undefined
    const domain = searchParams.get('domain') || undefined
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE), 10)))
    const search = searchParams.get('search') || undefined

    if (!agentId) {
      return NextResponse.json({ error: 'agentId is required' }, { status: 400 })
    }

    const validTiers = ['all', 'hot', 'warm', 'cold']
    if (!validTiers.includes(tier)) {
      return NextResponse.json({ error: `tier must be one of: ${validTiers.join(', ')}` }, { status: 400 })
    }

    const skip = (page - 1) * pageSize
    const where = {
      agentId,
      ...(category ? { category } : {}),
      ...(domain ? { domain } : {}),
      ...(search ? { content: { contains: search } } : {}),
    }

    // WARM tier: AgentMemory where tier='warm' AND isActive=true
    const warmWhere = { ...where, tier: 'warm' as const, isActive: true }
    // COLD tier: AgentMemory where tier='cold' OR isActive=false
    const coldWhere = { ...where, OR: [{ tier: 'cold' as const }, { isActive: false }] }

    const result: {
      hot: { memories: unknown[]; total: number }
      warm: { memories: unknown[]; total: number }
      cold: { memories: unknown[]; total: number }
    } = {
      hot: { memories: [], total: 0 },
      warm: { memories: [], total: 0 },
      cold: { memories: [], total: 0 },
    }

    // HOT tier — WorkingMemory (paginated by createdAt desc)
    if (tier === 'all' || tier === 'hot') {
      const [rows, total] = await Promise.all([
        db.workingMemory.findMany({
          where: { agentId, ...(search ? { content: { contains: search } } : {}) },
          orderBy: { createdAt: 'desc' },
          take: pageSize,
          skip,
          select: {
            id: true,
            sessionId: true,
            content: true,
            role: true,
            importance: true,
            expiresAt: true,
            createdAt: true,
          },
        }),
        db.workingMemory.count({ where: { agentId, ...(search ? { content: { contains: search } } : {}) } }),
      ])
      result.hot = {
        memories: rows.map(r => ({
          id: r.id,
          tier: 'hot' as const,
          sessionId: r.sessionId,
          content: r.content,
          role: r.role,
          importance: r.importance,
          category: 'session' as const,
          domain: 'session' as const,
          source: 'session' as const,
          isActive: true,
          expiresAt: r.expiresAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.createdAt.toISOString(),
          lastAccessedAt: null,
          accessCount: 0,
        })),
        total,
      }
    }

    // WARM tier — AgentMemory tier='warm' isActive=true
    if (tier === 'all' || tier === 'warm') {
      const [rows, total] = await Promise.all([
        db.agentMemory.findMany({
          where: warmWhere,
          orderBy: [{ importance: 'desc' }, { lastAccessedAt: 'desc' }],
          take: pageSize,
          skip,
        }),
        db.agentMemory.count({ where: warmWhere }),
      ])
      result.warm = {
        memories: rows.map(serializeAgentMemory),
        total,
      }
    }

    // COLD tier — AgentMemory tier='cold' OR isActive=false
    if (tier === 'all' || tier === 'cold') {
      const [rows, total] = await Promise.all([
        db.agentMemory.findMany({
          where: coldWhere,
          orderBy: [{ importance: 'asc' }, { lastAccessedAt: 'asc' }],
          take: pageSize,
          skip,
        }),
        db.agentMemory.count({ where: coldWhere }),
      ])
      result.cold = {
        memories: rows.map(serializeAgentMemory),
        total,
      }
    }

    return NextResponse.json({
      agentId,
      tier,
      page,
      pageSize,
      ...result,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[MemoryList API] GET error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

function serializeAgentMemory(m: {
  id: string
  agentId: string
  sessionId: string | null
  category: string
  content: string
  context: string | null
  importance: number
  accessCount: number
  lastAccessedAt: Date | null
  source: string
  tags: string | null
  domain: string
  isActive: boolean
  tier: string
  expiresAt: Date | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: m.id,
    tier: m.tier as 'warm' | 'cold',
    sessionId: m.sessionId,
    content: m.content,
    context: m.context,
    importance: m.importance,
    accessCount: m.accessCount,
    lastAccessedAt: m.lastAccessedAt?.toISOString() ?? null,
    source: m.source,
    tags: m.tags,
    domain: m.domain,
    isActive: m.isActive,
    category: m.category,
    expiresAt: m.expiresAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  }
}
