/**
 * POST /api/tools/publish — Publish a custom tool
 *
 * Accepts:
 *   { name } — mark tool as isPublic=true
 *
 * Note: This does NOT actually publish to ClawHub (that's a future feature).
 * It just sets the isPublic flag on the tool, indicating it's ready for sharing.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { registerCustomTool, type CustomToolEntry } from '@/lib/custom-tool-registry'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // ===== Validate required fields =====
    const { name } = body

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid "name" field' },
        { status: 400 }
      )
    }

    // ===== Check if tool exists =====
    const tool = await db.customTool.findUnique({
      where: { name },
    })

    if (!tool) {
      return NextResponse.json(
        { error: `Custom tool "${name}" not found` },
        { status: 404 }
      )
    }

    // ===== Check if already published =====
    if (tool.isPublic) {
      return NextResponse.json(
        { error: `Tool "${name}" is already published`, alreadyPublished: true },
        { status: 409 }
      )
    }

    // ===== Mark as published =====
    const updated = await db.customTool.update({
      where: { name },
      data: {
        isPublic: true,
      },
    })

    // Re-sync in-memory registry with updated isPublic flag
    try {
      let parameters: Record<string, unknown>
      try { parameters = JSON.parse(updated.parameters) } catch { parameters = { type: 'object', properties: {} } }

      const toolEntry: CustomToolEntry = {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        parameters,
        handlerCode: updated.handlerCode,
        version: updated.version,
        source: updated.source,
        category: updated.category,
        enabled: updated.enabled,
        isPublic: updated.isPublic,
        skillSlug: updated.skillSlug,
        callCount: updated.callCount,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      }
      await registerCustomTool(toolEntry, true)
    } catch {
      // Non-critical — registry sync failure shouldn't block publish
    }

    return NextResponse.json({
      published: true,
      tool: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        version: updated.version,
        category: updated.category,
        isPublic: updated.isPublic,
        publishedAt: updated.updatedAt,
        note: 'Tool marked as public. ClawHub publishing is a future feature.',
      },
    })
  } catch (err) {
    console.error('[Tools:Publish] Error:', err)
    return NextResponse.json(
      { error: 'Failed to publish tool', detail: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
