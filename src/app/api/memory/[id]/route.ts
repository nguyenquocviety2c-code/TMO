/**
 * Single Memory DELETE / PATCH API
 *
 * DELETE /api/memory/[id]            — Delete a single memory (any tier)
 * PATCH  /api/memory/[id]?action=promote — Promote COLD → WARM (set tier=warm, isActive=true)
 * PATCH  /api/memory/[id]?action=archive  — Archive WARM → COLD (set tier=cold, isActive=false)
 *
 * WHY THIS EXISTS:
 *   Existing DELETE /api/memory runs decay across ALL memories for an agent.
 *   The Memory tab UI needs per-row delete + manual tier transitions.
 *
 * Handles both AgentMemory IDs and WorkingMemory IDs (auto-detects by looking
 * up both tables).
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** Find which table a memory ID belongs to. Returns the tier + table. */
async function resolveMemoryTable(id: string): Promise<'agent' | 'working' | null> {
  // Try AgentMemory first (more common)
  const am = await db.agentMemory.findUnique({ where: { id }, select: { id: true } })
  if (am) return 'agent'
  const wm = await db.workingMemory.findUnique({ where: { id }, select: { id: true } })
  if (wm) return 'working'
  return null
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: memoryId } = await params
    const table = await resolveMemoryTable(memoryId)
    if (!table) {
      return NextResponse.json({ error: 'Memory not found' }, { status: 404 })
    }

    if (table === 'agent') {
      await db.agentMemory.delete({ where: { id: memoryId } })
    } else {
      await db.workingMemory.delete({ where: { id: memoryId } })
    }
    console.log(`[Memory/${memoryId.slice(0, 8)}] deleted (${table})`)
    return NextResponse.json({ success: true, id: memoryId, deletedFrom: table })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Memory DELETE] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: memoryId } = await params
    const action = request.nextUrl.searchParams.get('action')
    if (!action || !['promote', 'archive'].includes(action)) {
      return NextResponse.json(
        { error: '?action=promote or ?action=archive is required' },
        { status: 400 }
      )
    }

    // Manual tier transitions only apply to AgentMemory (not WorkingMemory — that
    // is auto-promoted by the tier transition worker at session end).
    const existing = await db.agentMemory.findUnique({ where: { id: memoryId } })
    if (!existing) {
      return NextResponse.json({ error: 'AgentMemory not found (only AgentMemory rows support manual tier transition)' }, { status: 404 })
    }

    if (action === 'promote') {
      // COLD → WARM
      const updated = await db.agentMemory.update({
        where: { id: memoryId },
        data: { tier: 'warm', isActive: true, importance: Math.max(existing.importance, 0.5) },
      })
      console.log(`[Memory/${memoryId.slice(0, 8)}] promoted → warm`)
      return NextResponse.json({ success: true, id: memoryId, action: 'promote', tier: updated.tier, isActive: updated.isActive })
    }

    // action === 'archive' → WARM → COLD
    const updated = await db.agentMemory.update({
      where: { id: memoryId },
      data: { tier: 'cold', isActive: false },
    })
    console.log(`[Memory/${memoryId.slice(0, 8)}] archived → cold`)
    return NextResponse.json({ success: true, id: memoryId, action: 'archive', tier: updated.tier, isActive: updated.isActive })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Memory PATCH] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
