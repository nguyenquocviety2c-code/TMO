/**
 * Key Pool Status API — Monitor API key rotation health
 *
 * GET /api/key-pools          — Summary of all key pools
 * GET /api/key-pools?detailed — Detailed per-key status (masked)
 */

import { NextRequest, NextResponse } from 'next/server'
import { tavilyKeyPool, jinaKeyPool, serperKeyPool } from '@/lib/service-key-pool'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const detailed = url.searchParams.has('detailed')

  const pools = {
    tavily: {
      name: 'Tavily',
      description: 'Deep web search AI-optimized',
      total: tavilyKeyPool.getTotalCount(),
      available: tavilyKeyPool.getAvailableCount(),
      summary: tavilyKeyPool.getSummary(),
      ...(detailed ? { keys: tavilyKeyPool.getKeyStatuses() } : {}),
    },
    serper: {
      name: 'Serper',
      description: 'Google Search API',
      total: serperKeyPool.getTotalCount(),
      available: serperKeyPool.getAvailableCount(),
      summary: serperKeyPool.getSummary(),
      ...(detailed ? { keys: serperKeyPool.getKeyStatuses() } : {}),
    },
    jina: {
      name: 'Jina Reader',
      description: 'Web page content extraction',
      total: jinaKeyPool.getTotalCount(),
      available: jinaKeyPool.getAvailableCount(),
      summary: jinaKeyPool.getSummary(),
      ...(detailed ? { keys: jinaKeyPool.getKeyStatuses() } : {}),
    },
  }

  const totalKeys = pools.tavily.total + pools.serper.total + pools.jina.total
  const availableKeys = pools.tavily.available + pools.serper.available + pools.jina.available

  return NextResponse.json({
    ok: true,
    overview: {
      totalKeys,
      availableKeys,
      health: availableKeys === totalKeys ? 'healthy' : availableKeys > 0 ? 'degraded' : 'critical',
    },
    pools,
    timestamp: new Date().toISOString(),
  })
}
