/**
 * OpenClaw Tool Permissions API — Manage tool access permissions
 *
 * GET /api/openclaw/tools/permissions — Get current permissions
 * PUT /api/openclaw/tools/permissions — Update permissions
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const permissions = await db.toolPermission.findMany({
    where: { agentId: 'default' },
    orderBy: { toolName: 'asc' },
  })

  return NextResponse.json({ permissions, total: permissions.length })
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { permissions } = body as { permissions: Array<{ toolName: string; permission: string }> }

    if (!permissions || !Array.isArray(permissions) || permissions.length === 0) {
      return NextResponse.json({ error: 'Thiếu danh sách permissions' }, { status: 400 })
    }

    // Validate permissions
    const validPermissions = ['allow', 'deny', 'ask']
    for (const p of permissions) {
      if (!p.toolName || !p.permission) {
        return NextResponse.json({ error: `Mỗi permission cần toolName và permission` }, { status: 400 })
      }
      if (!validPermissions.includes(p.permission)) {
        return NextResponse.json({ error: `Permission "${p.permission}" không hợp lệ. Dùng: allow, deny, ask` }, { status: 400 })
      }
    }

    // Upsert all permissions
    const results = await Promise.all(
      permissions.map(p =>
        db.toolPermission.upsert({
          where: { agentId_toolName: { agentId: 'default', toolName: p.toolName } },
          create: { agentId: 'default', toolName: p.toolName, permission: p.permission },
          update: { permission: p.permission },
        })
      )
    )

    return NextResponse.json({
      success: true,
      permissions: results,
      message: `Đã cập nhật ${results.length} tool permissions`,
    })
  } catch (error) {
    console.error('Tool permissions update error:', error)
    return NextResponse.json({ error: 'Lỗi khi cập nhật permissions' }, { status: 500 })
  }
}
