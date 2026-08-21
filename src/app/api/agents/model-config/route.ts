/**
 * Model Config Per Agent API
 *
 * GET  /api/agents/model-config          — List all model overrides
 * GET  /api/agents/model-config?agent=X  — Get override for specific agent
 * PUT  /api/agents/model-config          — Upsert model override for an agent
 *
 * Response shape: { ok: boolean, data?: T, error?: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

// ==================== VALIDATION ====================

const putSchema = z.object({
  agentName: z.string().min(1, 'agentName is required'),
  provider: z.string().min(1, 'provider is required'),
  model: z.string().min(1, 'model is required'),
})

// ==================== GET ====================

export async function GET(request: NextRequest) {
  try {
    const agentName = request.nextUrl.searchParams.get('agent')

    if (agentName) {
      // Get override for specific agent
      const override = await db.agentModelOverride.findUnique({
        where: { agentName },
      })

      if (!override) {
        return NextResponse.json({
          ok: true,
          data: null,
        })
      }

      return NextResponse.json({
        ok: true,
        data: {
          agentName: override.agentName,
          provider: override.provider,
          model: override.model,
          updatedAt: override.updatedAt,
        },
      })
    }

    // List all overrides
    const overrides = await db.agentModelOverride.findMany({
      orderBy: { agentName: 'asc' },
    })

    return NextResponse.json({
      ok: true,
      data: overrides.map((o) => ({
        agentName: o.agentName,
        provider: o.provider,
        model: o.model,
        updatedAt: o.updatedAt,
      })),
    })
  } catch (err) {
    console.error('[ModelConfigAPI] GET error:', err)
    return NextResponse.json(
      { ok: false, error: 'Failed to fetch model configs' },
      { status: 500 }
    )
  }
}

// ==================== PUT ====================

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = putSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues.map((i) => i.message).join(', ') },
        { status: 400 }
      )
    }

    const { agentName, provider, model } = parsed.data

    // Upsert: create or update
    const override = await db.agentModelOverride.upsert({
      where: { agentName },
      create: {
        agentName,
        provider,
        model,
      },
      update: {
        provider,
        model,
      },
    })

    return NextResponse.json({
      ok: true,
      data: {
        agentName: override.agentName,
        provider: override.provider,
        model: override.model,
        updatedAt: override.updatedAt,
      },
    })
  } catch (err) {
    console.error('[ModelConfigAPI] PUT error:', err)
    return NextResponse.json(
      { ok: false, error: 'Failed to update model config' },
      { status: 500 }
    )
  }
}