/**
 * OpenClaw Standing Orders API — Manage persistent agent instructions
 *
 * GET    /api/openclaw/automation/orders           — List all standing orders
 * POST   /api/openclaw/automation/orders           — Create a standing order
 * PUT    /api/openclaw/automation/orders           — Update a standing order
 * DELETE /api/openclaw/automation/orders?id=xxx     — Delete a standing order
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

const AGENT_ID = 'default'

// ─── GET ────────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const orders = await db.standingOrder.findMany({
      where: { agentId: AGENT_ID },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    })
    return NextResponse.json({ orders, total: orders.length })
  } catch (error) {
    console.error('[Orders GET] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch standing orders' }, { status: 500 })
  }
}

// ─── POST (Create) ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { order, priority, enabled } = body

    if (!order) {
      return NextResponse.json({ error: 'order is required' }, { status: 400 })
    }

    const standingOrder = await db.standingOrder.create({
      data: {
        agentId: AGENT_ID,
        order,
        priority: priority ?? 0,
        enabled: enabled ?? true,
      },
    })

    return NextResponse.json({ success: true, order: standingOrder })
  } catch (error) {
    console.error('[Orders POST] Error:', error)
    return NextResponse.json({ error: 'Failed to create standing order' }, { status: 500 })
  }
}

// ─── PUT (Update) ───────────────────────────────────────────────────────────────

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, order, priority, enabled } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const existing = await db.standingOrder.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Standing order not found' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (order !== undefined) data.order = order
    if (priority !== undefined) data.priority = priority
    if (enabled !== undefined) data.enabled = enabled

    const updated = await db.standingOrder.update({ where: { id }, data })
    return NextResponse.json({ success: true, order: updated })
  } catch (error) {
    console.error('[Orders PUT] Error:', error)
    return NextResponse.json({ error: 'Failed to update standing order' }, { status: 500 })
  }
}

// ─── DELETE ─────────────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id query parameter is required' }, { status: 400 })
    }

    const existing = await db.standingOrder.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Standing order not found' }, { status: 404 })
    }

    await db.standingOrder.delete({ where: { id } })
    return NextResponse.json({ success: true, message: 'Standing order deleted' })
  } catch (error) {
    console.error('[Orders DELETE] Error:', error)
    return NextResponse.json({ error: 'Failed to delete standing order' }, { status: 500 })
  }
}
