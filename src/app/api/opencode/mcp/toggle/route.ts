/**
 * MCP Bridge Toggle — Magnum Opus
 * 
 * POST /api/opencode/mcp/toggle
 * Enable or disable an individual MCP tool in the bridge.
 * 
 * Body: { direction: 'outbound' | 'inbound', toolName: string, enabled: boolean }
 */

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { direction, toolName, enabled } = body

    if (!direction || !toolName || typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'direction, toolName, and enabled (boolean) are required' },
        { status: 400 }
      )
    }

    if (!['outbound', 'inbound'].includes(direction)) {
      return NextResponse.json(
        { error: 'direction must be "outbound" or "inbound"' },
        { status: 400 }
      )
    }

    // Upsert the MCPBridgeConfig entry
    const config = await db.mCPBridgeConfig.upsert({
      where: { direction_toolName: { direction, toolName } },
      update: { enabled },
      create: { direction, toolName, enabled, config: '{}' },
    })

    // If toggling an inbound tool, also toggle the corresponding AgentSkill
    if (direction === 'inbound') {
      const slugMap: Record<string, string> = {
        file_read: 'opencode-file-read',
        file_edit: 'opencode-file-edit',
        bash_exec: 'opencode-bash-exec',
        lsp_diag: 'opencode-lsp-diag',
        fetch_url: 'opencode-fetch-url',
      }
      const skillSlug = slugMap[toolName]
      if (skillSlug) {
        try {
          await db.agentSkill.updateMany({
            where: { slug: skillSlug, agentId: 'default' },
            data: { enabled },
          })
        } catch { /* skill may not exist yet */ }
      }
    }

    // If toggling an outbound tool, also update the MCP bridge config
    if (direction === 'outbound' && !enabled) {
      // When disabling an outbound tool, log it
      console.log(`[MCP Toggle] Outbound tool "${toolName}" disabled — OpenCode won't see this tool`)
    }

    return NextResponse.json({
      success: true,
      direction,
      toolName,
      enabled,
      config,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Toggle failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
