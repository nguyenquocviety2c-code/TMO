/**
 * Per-Agent Tool Permissions API
 *
 * GET  /api/openclaw/permissions/agents/[agentId] — Get all tool permissions for a specific agent (with inherited defaults)
 * POST /api/openclaw/permissions/agents/[agentId] — Set a tool permission for a specific agent
 * PUT  /api/openclaw/permissions/agents/[agentId] — Batch update tool permissions for a specific agent
 *
 * Inheritance logic:
 * - If an agent has no explicit permission for a tool, it inherits from "default" agent's permission.
 * - If "default" also has no permission, the tool is "allow" by default.
 * - Response includes an `inherited` flag to indicate whether the permission is inherited.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** Valid permission values */
const VALID_PERMISSIONS = ['allow', 'deny', 'ask'] as const
type ValidPermission = (typeof VALID_PERMISSIONS)[number]

function isValidPermission(value: unknown): value is ValidPermission {
  return typeof value === 'string' && VALID_PERMISSIONS.includes(value as ValidPermission)
}

// GET: Get all tool permissions for a specific agent (including inherited defaults)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params

    // Fetch agent-specific permissions
    const agentPerms = await db.toolPermission.findMany({
      where: { agentId },
      orderBy: { toolName: 'asc' },
    })

    // Fetch default agent permissions for inheritance
    const defaultPerms = await db.toolPermission.findMany({
      where: { agentId: 'default' },
    })

    // Build maps for quick lookup
    const agentPermMap = new Map(agentPerms.map(p => [p.toolName, p]))
    const defaultPermMap = new Map(defaultPerms.map(p => [p.toolName, p]))

    // Merge: agent-specific overrides default, default overrides implicit "allow"
    // Collect all unique tool names from both agent and default
    const allToolNames = new Set([
      ...agentPermMap.keys(),
      ...defaultPermMap.keys(),
    ])

    const mergedPermissions: Array<{
      toolName: string
      permission: string
      source: string
      requiresApproval: boolean
      maxCallsPerHour: number | null
      inherited: boolean
      inheritedFrom: string | null
    }> = []

    for (const toolName of allToolNames) {
      const agentPerm = agentPermMap.get(toolName)
      const defaultPerm = defaultPermMap.get(toolName)

      if (agentPerm) {
        // Agent has explicit permission
        mergedPermissions.push({
          toolName,
          permission: agentPerm.permission,
          source: agentPerm.source,
          requiresApproval: agentPerm.requiresApproval,
          maxCallsPerHour: agentPerm.maxCallsPerHour,
          inherited: false,
          inheritedFrom: null,
        })
      } else if (defaultPerm) {
        // Inherit from default
        mergedPermissions.push({
          toolName,
          permission: defaultPerm.permission,
          source: defaultPerm.source,
          requiresApproval: defaultPerm.requiresApproval,
          maxCallsPerHour: defaultPerm.maxCallsPerHour,
          inherited: true,
          inheritedFrom: 'default',
        })
      }
    }

    // Sort by toolName
    mergedPermissions.sort((a, b) => a.toolName.localeCompare(b.toolName))

    return NextResponse.json({
      agentId,
      permissions: mergedPermissions,
      total: mergedPermissions.length,
      explicit: agentPerms.length,
      inherited: mergedPermissions.filter(p => p.inherited).length,
    })
  } catch (error) {
    console.error('[Permissions/AgentId] GET error:', error)
    return NextResponse.json({ error: 'Failed to get agent permissions' }, { status: 500 })
  }
}

// POST: Set a tool permission for a specific agent
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params
    const body = await request.json()
    const { toolName, permission, source, requiresApproval, maxCallsPerHour } = body

    if (!toolName || typeof toolName !== 'string') {
      return NextResponse.json({ error: 'toolName is required and must be a string' }, { status: 400 })
    }

    // Validate permission value
    if (permission !== undefined && !isValidPermission(permission)) {
      return NextResponse.json(
        { error: `Permission "${permission}" is invalid. Must be one of: allow, deny, ask` },
        { status: 400 }
      )
    }

    const perm = await db.toolPermission.upsert({
      where: { agentId_toolName: { agentId, toolName } },
      create: {
        agentId,
        toolName,
        permission: permission || 'allow',
        source: source || 'custom',
        requiresApproval: requiresApproval ?? false,
        maxCallsPerHour: maxCallsPerHour ?? null,
      },
      update: {
        permission: permission !== undefined ? permission : undefined,
        source: source !== undefined ? source : undefined,
        requiresApproval: requiresApproval !== undefined ? requiresApproval : undefined,
        maxCallsPerHour: maxCallsPerHour !== undefined ? maxCallsPerHour : undefined,
      },
    })

    return NextResponse.json({ success: true, permission: perm })
  } catch (error) {
    console.error('[Permissions/AgentId] POST error:', error)
    return NextResponse.json({ error: 'Failed to set agent tool permission' }, { status: 500 })
  }
}

// PUT: Batch update tool permissions for a specific agent
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params
    const body = await request.json()
    const { permissions } = body as {
      permissions: Array<{
        toolName: string
        permission: string
        source?: string
        requiresApproval?: boolean
        maxCallsPerHour?: number | null
      }>
    }

    if (!permissions || !Array.isArray(permissions) || permissions.length === 0) {
      return NextResponse.json({ error: 'Missing permissions list' }, { status: 400 })
    }

    // Validate all permissions before making any changes
    for (const p of permissions) {
      if (!p.toolName || !p.permission) {
        return NextResponse.json(
          { error: 'Each permission requires toolName and permission' },
          { status: 400 }
        )
      }
      if (!isValidPermission(p.permission)) {
        return NextResponse.json(
          { error: `Permission "${p.permission}" is invalid. Must be one of: allow, deny, ask` },
          { status: 400 }
        )
      }
    }

    const results = await Promise.all(
      permissions.map(p =>
        db.toolPermission.upsert({
          where: { agentId_toolName: { agentId, toolName: p.toolName } },
          create: {
            agentId,
            toolName: p.toolName,
            permission: p.permission,
            source: p.source || 'custom',
            requiresApproval: p.requiresApproval ?? false,
            maxCallsPerHour: p.maxCallsPerHour ?? null,
          },
          update: {
            permission: p.permission,
            ...(p.source !== undefined ? { source: p.source } : {}),
            ...(p.requiresApproval !== undefined ? { requiresApproval: p.requiresApproval } : {}),
            ...(p.maxCallsPerHour !== undefined ? { maxCallsPerHour: p.maxCallsPerHour } : {}),
          },
        })
      )
    )

    return NextResponse.json({
      success: true,
      permissions: results,
      message: `Updated ${results.length} tool permissions for agent ${agentId}`,
    })
  } catch (error) {
    console.error('[Permissions/AgentId] PUT error:', error)
    return NextResponse.json({ error: 'Failed to batch update agent permissions' }, { status: 500 })
  }
}
