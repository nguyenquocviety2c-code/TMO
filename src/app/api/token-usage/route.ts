/**
 * Token Usage API — LOCAL-ONLY ARCHITECTURE (SQLite)
 *
 * GET  /api/token-usage          — Get today's token usage (in-memory + SQLite)
 * GET  /api/token-usage?date=YYYY-MM-DD — Get token usage for a specific date
 * GET  /api/token-usage?history=30       — Get last N days of token usage history
 * POST /api/token-usage?action=reset     — Reset today's token counters to 0
 * POST /api/token-usage                  — Return current local token data (no remote sync)
 *
 * Architecture: In-memory → SQLite (local only, no remote sync)
 * - READ:  100% local (in-memory + SQLite) — instant response
 * - WRITE: In-memory → SQLite (every 30s)
 * - RESET: Clear in-memory and SQLite
 */

import { NextRequest, NextResponse } from 'next/server'
import { getDailyTokenUsage, getDailyTokensByProvider, getDailyTokensByProviderSlot, getDailyTokensByProviderModel, getDailyTokensByAgent, resetDailyTokens } from '@/lib/llm'
import { db } from '@/lib/db'
import type { TokenData } from '@/lib/token-sync'

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

/** Update local SQLite from a TokenData object */
async function updateLocalFromTokenData(data: TokenData): Promise<void> {
  await db.dailyTokenUsage.upsert({
    where: { date: data.date },
    update: { tokens: data.tokens },
    create: { date: data.date, tokens: data.tokens },
  })
  for (const [provider, tokens] of Object.entries(data.providers)) {
    await db.dailyTokenByProvider.upsert({
      where: { date_provider: { date: data.date, provider } },
      update: { tokens },
      create: { date: data.date, provider, tokens },
    })
  }
  for (const [provider, slots] of Object.entries(data.slots)) {
    for (const [slotStr, tokens] of Object.entries(slots)) {
      const slot = parseInt(slotStr, 10)
      await db.dailyTokenByProviderSlot.upsert({
        where: { date_provider_slot: { date: data.date, provider, slot } },
        update: { tokens },
        create: { date: data.date, provider, slot, tokens },
      })
    }
  }
  for (const [provider, models] of Object.entries(data.models || {})) {
    for (const [modelName, tokens] of Object.entries(models as Record<string, number>)) {
      await db.dailyTokenByProviderModel.upsert({
        where: { date_provider_model: { date: data.date, provider, model: modelName } },
        update: { tokens },
        create: { date: data.date, provider, model: modelName, tokens },
      })
    }
  }
}

// ==================== GET — LOCAL-ONLY READS ====================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const dateParam = searchParams.get('date')
    const historyDays = parseInt(searchParams.get('history') || '0', 10)

    // History mode: return last N days of token usage from SQLite
    if (historyDays > 0) {
      const days = Math.min(historyDays, 90)

      // 100% local — read from SQLite only
      const records = await db.dailyTokenUsage.findMany({
        orderBy: { date: 'desc' },
        take: days,
      })

      const providerRecords = await db.dailyTokenByProvider.findMany({
        orderBy: [{ date: 'desc' }, { provider: 'asc' }],
        take: days * 4,
      })

      const slotRecords = await db.dailyTokenByProviderSlot.findMany({
        orderBy: [{ date: 'desc' }, { provider: 'asc' }, { slot: 'asc' }],
        take: days * 4 * 4,
      })

      const modelRecords = await db.dailyTokenByProviderModel.findMany({
        orderBy: [{ date: 'desc' }, { provider: 'asc' }, { model: 'asc' }],
        take: days * 20,
      })

      const agentRecords = await db.dailyTokenByAgent.findMany({
        orderBy: [{ date: 'desc' }, { agentName: 'asc' }, { provider: 'asc' }, { model: 'asc' }],
        take: days * 50,
      })

      const providerByDate: Record<string, Record<string, number>> = {}
      for (const rec of providerRecords) {
        if (!providerByDate[rec.date]) providerByDate[rec.date] = {}
        providerByDate[rec.date][rec.provider] = rec.tokens
      }

      const slotByDate: Record<string, Record<string, Record<number, number>>> = {}
      for (const rec of slotRecords) {
        if (!slotByDate[rec.date]) slotByDate[rec.date] = {}
        if (!slotByDate[rec.date][rec.provider]) slotByDate[rec.date][rec.provider] = {}
        slotByDate[rec.date][rec.provider][rec.slot] = rec.tokens
      }

      const modelByDate: Record<string, Record<string, Record<string, number>>> = {}
      for (const rec of modelRecords) {
        if (!modelByDate[rec.date]) modelByDate[rec.date] = {}
        if (!modelByDate[rec.date][rec.provider]) modelByDate[rec.date][rec.provider] = {}
        modelByDate[rec.date][rec.provider][rec.model] = rec.tokens
      }

      const agentsByDate: Record<string, Array<{ agentId: string; agentName: string; provider: string; model: string; tokens: number; inputTokens: number; outputTokens: number }>> = {}
      for (const rec of agentRecords) {
        if (!agentsByDate[rec.date]) agentsByDate[rec.date] = []
        agentsByDate[rec.date].push({
          agentId: rec.agentId,
          agentName: rec.agentName,
          provider: rec.provider,
          model: rec.model,
          tokens: rec.tokens,
          inputTokens: rec.inputTokens,
          outputTokens: rec.outputTokens,
        })
      }

      const history = records.map(r => ({
        date: r.date,
        tokens: r.tokens,
        providers: providerByDate[r.date] || {},
        slots: slotByDate[r.date] || {},
        models: modelByDate[r.date] || {},
        agents: agentsByDate[r.date] || [],
      }))

      return NextResponse.json({ history, source: 'local' })
    }

    // Specific date mode — read from SQLite
    if (dateParam) {
      const record = await db.dailyTokenUsage.findUnique({
        where: { date: dateParam },
      })

      if (!record) {
        return NextResponse.json({
          date: dateParam,
          tokens: 0,
          providers: {},
          slots: {},
          models: {},
          agents: [],
          source: 'none',
        })
      }

      const providerRecords = await db.dailyTokenByProvider.findMany({
        where: { date: dateParam },
      })

      const providers: Record<string, number> = {}
      for (const rec of providerRecords) {
        providers[rec.provider] = rec.tokens
      }

      const slotRecords = await db.dailyTokenByProviderSlot.findMany({
        where: { date: dateParam },
      })

      const slots: Record<string, Record<number, number>> = {}
      for (const rec of slotRecords) {
        if (!slots[rec.provider]) slots[rec.provider] = {}
        slots[rec.provider][rec.slot] = rec.tokens
      }

      const modelRecords = await db.dailyTokenByProviderModel.findMany({
        where: { date: dateParam },
      })

      const models: Record<string, Record<string, number>> = {}
      for (const rec of modelRecords) {
        if (!models[rec.provider]) models[rec.provider] = {}
        models[rec.provider][rec.model] = rec.tokens
      }

      // Get per-agent data for this specific date
      const agentRecords = await db.dailyTokenByAgent.findMany({
        where: { date: dateParam },
        orderBy: [{ agentName: 'asc' }, { provider: 'asc' }, { model: 'asc' }],
      })

      const agents = agentRecords.map(rec => ({
        agentId: rec.agentId,
        agentName: rec.agentName,
        provider: rec.provider,
        model: rec.model,
        tokens: rec.tokens,
        inputTokens: rec.inputTokens,
        outputTokens: rec.outputTokens,
      }))

      return NextResponse.json({
        date: record.date,
        tokens: record.tokens,
        providers,
        slots,
        models,
        agents,
        source: 'local',
      })
    }

    // ==================== DEFAULT: TODAY — 100% LOCAL ====================

    const todayUsage = await getDailyTokenUsage()
    const todayProviders = getDailyTokensByProvider()
    const todaySlots = getDailyTokensByProviderSlot()
    const todayModels = getDailyTokensByProviderModel()
    const todayAgents = getDailyTokensByAgent()

    // Read SQLite data — wrap each in individual try-catch so in-memory data is never lost
    let dbRecord: any = null
    let dbProviderRecords: any[] = []
    let dbSlotRecords: any[] = []
    let dbModelRecords: any[] = []
    let dbAgentRecords: any[] = []
    try {
      dbRecord = await db.dailyTokenUsage.findUnique({
        where: { date: todayUsage.date },
      })
    } catch { /* SQLite unavailable — use in-memory only */ }
    try {
      dbProviderRecords = await db.dailyTokenByProvider.findMany({
        where: { date: todayUsage.date },
      })
    } catch { /* SQLite unavailable */ }
    try {
      dbSlotRecords = await db.dailyTokenByProviderSlot.findMany({
        where: { date: todayUsage.date },
      })
    } catch { /* SQLite unavailable */ }
    try {
      dbModelRecords = await db.dailyTokenByProviderModel.findMany({
        where: { date: todayUsage.date },
      })
    } catch { /* SQLite unavailable */ }
    try {
      dbAgentRecords = await db.dailyTokenByAgent.findMany({
        where: { date: todayUsage.date },
      })
    } catch { /* SQLite unavailable */ }

    // Merge in-memory + SQLite (take MAX of each value)
    const mergedProviders: Record<string, number> = {}
    for (const rec of dbProviderRecords) {
      mergedProviders[rec.provider] = rec.tokens
    }
    for (const [provider, tokens] of Object.entries(todayProviders)) {
      mergedProviders[provider] = Math.max(tokens, mergedProviders[provider] || 0)
    }

    const mergedSlots: Record<string, Record<number, number>> = {}
    for (const rec of dbSlotRecords) {
      if (!mergedSlots[rec.provider]) mergedSlots[rec.provider] = {}
      mergedSlots[rec.provider][rec.slot] = rec.tokens
    }
    for (const [provider, slots] of Object.entries(todaySlots)) {
      if (!mergedSlots[provider]) mergedSlots[provider] = {}
      for (const [slotStr, tokens] of Object.entries(slots)) {
        const slot = parseInt(slotStr, 10)
        mergedSlots[provider][slot] = Math.max(tokens, mergedSlots[provider]?.[slot] || 0)
      }
    }

    const mergedModels: Record<string, Record<string, number>> = {}
    for (const rec of dbModelRecords) {
      if (!mergedModels[rec.provider]) mergedModels[rec.provider] = {}
      mergedModels[rec.provider][rec.model] = rec.tokens
    }
    for (const [provider, models] of Object.entries(todayModels)) {
      if (!mergedModels[provider]) mergedModels[provider] = {}
      for (const [modelName, tokens] of Object.entries(models)) {
        mergedModels[provider][modelName] = Math.max(tokens, mergedModels[provider]?.[modelName] || 0)
      }
    }

    const providerSum = Object.values(todayProviders).reduce((a, b) => a + b, 0)
    const sqliteTokens = dbRecord?.tokens || 0
    const totalTokens = Math.max(todayUsage.tokens, sqliteTokens, providerSum)
    const recalculatedTotal = Object.values(mergedProviders).reduce((a, b) => a + b, 0)
    const finalTotal = Math.max(totalTokens, recalculatedTotal)

    // Merge in-memory + SQLite for agents (same pattern as providers/models)
    const mergedAgentsMap: Record<string, { agentId: string; agentName: string; provider: string; model: string; tokens: number; inputTokens: number; outputTokens: number }> = {}
    for (const rec of dbAgentRecords) {
      const key = `${rec.agentId}:${rec.provider}:${rec.model}`
      mergedAgentsMap[key] = {
        agentId: rec.agentId,
        agentName: rec.agentName,
        provider: rec.provider,
        model: rec.model,
        tokens: rec.tokens,
        inputTokens: rec.inputTokens,
        outputTokens: rec.outputTokens,
      }
    }
    for (const item of todayAgents) {
      const key = `${item.agentId}:${item.provider}:${item.model}`
      const existing = mergedAgentsMap[key]
      if (existing) {
        existing.tokens = Math.max(existing.tokens, item.tokens)
        existing.inputTokens = Math.max(existing.inputTokens, item.inputTokens)
        existing.outputTokens = Math.max(existing.outputTokens, item.outputTokens)
      } else {
        mergedAgentsMap[key] = { ...item }
      }
    }
    const mergedAgents = Object.values(mergedAgentsMap)

    return NextResponse.json({
      date: todayUsage.date,
      tokens: finalTotal,
      providers: mergedProviders,
      slots: mergedSlots,
      models: mergedModels,
      agents: mergedAgents,
      source: 'local',
    })
  } catch (error) {
    console.error('[TokenUsage] GET error:', error)
    // Return safe default data instead of 500 — allows UI to render even if DB is not ready
    const errMsg = error instanceof Error ? error.message : 'Failed to get token usage'
    // Catch ALL errors and return fallback — no more 500 for local dev issues
    return NextResponse.json({
      date: new Date().toISOString().slice(0, 10),
      tokens: 0,
      providers: {},
      slots: {},
      models: {},
      agents: [],
      source: 'fallback',
      warning: errMsg.includes('no such table') || errMsg.includes('SQLITE_ERROR')
        ? 'Database chưa sẵn sàng. Chạy: bun run db:push'
        : errMsg.includes('Prisma Client')
          ? 'Prisma client chưa khởi tạo. Chạy: bun run db:push'
          : `Lỗi tạm thời: ${errMsg.slice(0, 100)}`,
    })
  }
}

// ==================== POST — LOCAL MANAGEMENT ACTIONS ====================

/**
 * POST /api/token-usage — Local management actions
 *
 * Actions:
 *   ?action=reset — Reset today's token counters to 0 (in-memory + SQLite)
 *   (no action)   — Return current local token data
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    // Reset action: clear all token counters for today
    if (action === 'reset') {
      await resetDailyTokens()
      return NextResponse.json({
        success: true,
        message: 'Daily token counters reset to 0 (in-memory + SQLite)',
        date: getTodayUserTz(),
      })
    }

    // Default: return current local token data
    const todayUsage = await getDailyTokenUsage()
    const todayProviders = getDailyTokensByProvider()
    const todaySlots = getDailyTokensByProviderSlot()
    const todayModels = getDailyTokensByProviderModel()

    const localData: TokenData = {
      date: todayUsage.date,
      tokens: todayUsage.tokens,
      providers: todayProviders,
      slots: todaySlots,
      models: todayModels,
    }

    // Ensure local SQLite is up to date
    await updateLocalFromTokenData(localData)

    return NextResponse.json({
      success: true,
      message: 'Local token data retrieved (SQLite only, no remote sync)',
      data: localData,
    })
  } catch (error) {
    console.error('[TokenUsage] POST error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process token usage request' },
      { status: 500 }
    )
  }
}
