/**
 * Agent Permissions List API
 *
 * GET /api/openclaw/permissions/agents — List all agents with their tool permission counts
 *
 * Returns a summary of each agent's permission configuration:
 * - Total tools with explicit permissions
 * - Count of denied tools
 * - Count of "ask" permission tools (require approval)
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest) {
  try {
    // Fetch all agent profiles
    const agents = await db.agentProfile.findMany({
      select: {
        id: true,
        name: true,
        enabled: true,
      },
      orderBy: { name: 'asc' },
    })

    // Fetch all tool permissions grouped by agentId
    const allPermissions = await db.toolPermission.findMany({
      select: {
        agentId: true,
        permission: true,
      },
    })

    // Build permission count map per agent
    const permCountMap = new Map<string, { toolCount: number; deniedCount: number; askCount: number }>()

    for (const perm of allPermissions) {
      const existing = permCountMap.get(perm.agentId) || { toolCount: 0, deniedCount: 0, askCount: 0 }
      existing.toolCount++
      if (perm.permission === 'deny') existing.deniedCount++
      if (perm.permission === 'ask') existing.askCount++
      permCountMap.set(perm.agentId, existing)
    }

    // Include "default" agent entry even if it has no AgentProfile
    const defaultCounts = permCountMap.get('default') || { toolCount: 0, deniedCount: 0, askCount: 0 }

    // Build result: default agent first, then all agent profiles
    const result: Array<{
      agentId: string
      agentName: string
      toolCount: number
      deniedCount: number
      askCount: number
    }> = [
      {
        agentId: 'default',
        agentName: 'Default (Global)',
        toolCount: defaultCounts.toolCount,
        deniedCount: defaultCounts.deniedCount,
        askCount: defaultCounts.askCount,
      },
    ]

    for (const agent of agents) {
      const counts = permCountMap.get(agent.id) || { toolCount: 0, deniedCount: 0, askCount: 0 }
      result.push({
        agentId: agent.id,
        agentName: agent.name,
        toolCount: counts.toolCount,
        deniedCount: counts.deniedCount,
        askCount: counts.askCount,
      })
    }

    return NextResponse.json({ agents: result, total: result.length })
  } catch (error) {
    console.error('[Permissions/Agents] GET error:', error)
    return NextResponse.json({ error: 'Failed to list agent permissions' }, { status: 500 })
  }
}
