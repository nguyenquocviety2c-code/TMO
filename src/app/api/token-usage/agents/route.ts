/**
 * Per-Agent Token Usage API
 *
 * GET /api/token-usage/agents          — Get today's per-agent token usage
 * GET /api/token-usage/agents?date=YYYY-MM-DD — Get per-agent token usage for a specific date
 *
 * Returns: Array of { agentId, agentName, provider, model, tokens, inputTokens, outputTokens }
 * plus aggregated totals per agent.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getDailyTokensByAgent } from '@/lib/llm'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** Get today's date in the user's timezone (Asia/Ho_Chi_Minh, ICT UTC+7). */
function getTodayUserTz(): string {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const year = parts.find(p => p.type === 'year')!.value
  const month = parts.find(p => p.type === 'month')!.value
  const day = parts.find(p => p.type === 'day')!.value
  return `${year}-${month}-${day}`
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const dateParam = searchParams.get('date')
    const date = dateParam || getTodayUserTz()

    // Get in-memory data for today (only relevant if date is today)
    const today = getTodayUserTz()
    let inMemoryData: Array<{
      agentId: string
      agentName: string
      provider: string
      model: string
      tokens: number
      inputTokens: number
      outputTokens: number
    }> = []

    if (date === today) {
      inMemoryData = getDailyTokensByAgent()
    }

    // Get SQLite data for the requested date
    const dbRecords = await db.dailyTokenByAgent.findMany({
      where: { date },
      orderBy: [{ agentName: 'asc' }, { provider: 'asc' }, { model: 'asc' }],
    })

    // Build merged data: in-memory + SQLite, taking MAX for each unique key
    const mergedMap: Record<string, {
      agentId: string
      agentName: string
      provider: string
      model: string
      tokens: number
      inputTokens: number
      outputTokens: number
    }> = {}

    // Start with DB records
    for (const rec of dbRecords) {
      const key = `${rec.agentId}:${rec.provider}:${rec.model}`
      mergedMap[key] = {
        agentId: rec.agentId,
        agentName: rec.agentName,
        provider: rec.provider,
        model: rec.model,
        tokens: rec.tokens,
        inputTokens: rec.inputTokens,
        outputTokens: rec.outputTokens,
      }
    }

    // Merge in-memory data (take MAX for each field)
    for (const item of inMemoryData) {
      const key = `${item.agentId}:${item.provider}:${item.model}`
      const existing = mergedMap[key]
      if (existing) {
        existing.tokens = Math.max(existing.tokens, item.tokens)
        existing.inputTokens = Math.max(existing.inputTokens, item.inputTokens)
        existing.outputTokens = Math.max(existing.outputTokens, item.outputTokens)
      } else {
        mergedMap[key] = { ...item }
      }
    }

    // Build flat list and agent-level aggregations
    const records = Object.values(mergedMap)

    // Aggregate per agent
    const agentAggregates: Record<string, {
      agentId: string
      agentName: string
      totalTokens: number
      totalInputTokens: number
      totalOutputTokens: number
      providers: Record<string, number>
      models: Record<string, number>
    }> = {}

    for (const rec of records) {
      if (!agentAggregates[rec.agentId]) {
        agentAggregates[rec.agentId] = {
          agentId: rec.agentId,
          agentName: rec.agentName,
          totalTokens: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          providers: {},
          models: {},
        }
      }
      const agg = agentAggregates[rec.agentId]
      agg.totalTokens += rec.tokens
      agg.totalInputTokens += rec.inputTokens
      agg.totalOutputTokens += rec.outputTokens
      agg.providers[rec.provider] = (agg.providers[rec.provider] || 0) + rec.tokens
      agg.models[rec.model] = (agg.models[rec.model] || 0) + rec.tokens
    }

    return NextResponse.json({
      date,
      records,
      agents: Object.values(agentAggregates),
      source: 'local',
    })
  } catch (error) {
    console.error('[TokenUsage/Agents] GET error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get agent token usage' },
      { status: 500 }
    )
  }
}
