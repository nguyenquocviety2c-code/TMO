/**
 * Setup Check API — Diagnose common local dev issues
 *
 * GET /api/setup/check — Check if database, Qdrant, and other services are ready
 */

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const checks: Record<string, { ok: boolean; message: string; hint?: string }> = {}

  // 1. Check SQLite/Prisma database
  try {
    await db.agentProfile.count()
    checks.database = { ok: true, message: 'SQLite database connected, tables exist' }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    let hint = 'Run: bun run db:push'
    if (errMsg.includes('Prisma Client')) {
      hint = 'Run: bunx prisma generate && bun run db:push'
    } else if (errMsg.includes('no such table') || errMsg.includes('does not exist')) {
      hint = 'Database tables missing. Run: bun run db:push'
    } else if (errMsg.includes('DATABASE_URL')) {
      hint = 'DATABASE_URL not set in .env file. Copy .env.example to .env first.'
    }
    checks.database = { ok: false, message: errMsg, hint }
  }

  // 2. Check if agents are seeded
  if (checks.database.ok) {
    try {
      const count = await db.agentProfile.count()
      checks.agents = {
        ok: count > 0,
        message: count > 0 ? `${count} agents found in database` : 'No agents found — will be auto-seeded on first /api/agents call',
        hint: count === 0 ? 'Visit /api/agents to auto-seed, or run: curl http://localhost:3000/api/agents' : undefined,
      }
    } catch (err) {
      checks.agents = { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  } else {
    checks.agents = { ok: false, message: 'Cannot check — database not available' }
  }

  // 3. Check Qdrant
  try {
    const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333'
    const res = await fetch(`${qdrantUrl}/healthz`, { signal: AbortSignal.timeout(3000) })
    checks.qdrant = { ok: res.ok, message: res.ok ? 'Qdrant is running' : `Qdrant returned ${res.status}` }
  } catch {
    checks.qdrant = { ok: false, message: 'Qdrant not reachable', hint: 'Start Qdrant: docker run -p 6333:6333 qdrant/qdrant' }
  }

  const allOk = Object.values(checks).every(c => c.ok)

  return NextResponse.json({
    status: allOk ? 'ready' : 'issues',
    checks,
    hint: allOk
      ? 'All checks passed — app is ready for local development'
      : 'Some checks failed — see hints above for fixes',
  })
}
