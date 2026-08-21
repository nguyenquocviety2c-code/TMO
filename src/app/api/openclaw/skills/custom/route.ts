/**
 * OpenClaw Custom Skills API — Create/update/delete custom skills
 *
 * POST   /api/openclaw/skills/custom — Create a new custom skill
 * PUT    /api/openclaw/skills/custom — Update a custom skill
 * DELETE /api/openclaw/skills/custom — Delete a custom skill
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { writeFileSync, mkdirSync, unlinkSync, existsSync, readdirSync, rmdirSync } from 'fs'
import { join } from 'path'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { slug, name, content, enabled, version, source } = body

    if (!slug || !name || !content) {
      return NextResponse.json({ error: 'Thiếu slug, name hoặc content' }, { status: 400 })
    }

    // Validate source — only allow 'custom' and 'template'
    const validSource = (source === 'template') ? 'template' : 'custom'

    // Check if skill slug already exists
    const existing = await db.agentSkill.findUnique({
      where: { agentId_slug: { agentId: 'default', slug } },
    })
    if (existing) {
      return NextResponse.json({ error: `Skill "${slug}" đã tồn tại` }, { status: 409 })
    }

    const skill = await db.agentSkill.create({
      data: {
        agentId: 'default',
        slug,
        name,
        content,
        source: validSource,
        enabled: enabled !== undefined ? enabled : true,
        version: version || '1.0.0',
      },
    })

    // Write SKILL.md to filesystem for z.ai platform layer injection (only if enabled)
    const isEnabled = enabled !== undefined ? enabled : true
    if (isEnabled) {
      try {
        const skillsDir = join(process.cwd(), 'skills', slug)
        mkdirSync(skillsDir, { recursive: true })
        writeFileSync(join(skillsDir, 'SKILL.md'), content, 'utf-8')
        console.log(`[Skills] Wrote custom SKILL.md to filesystem: skills/${slug}/SKILL.md`)
      } catch (fsErr) {
        console.warn(`[Skills] Failed to write custom SKILL.md to filesystem:`, fsErr instanceof Error ? fsErr.message : String(fsErr))
      }
    }

    return NextResponse.json({ success: true, skill, message: `Custom skill "${name}" đã tạo thành công` })
  } catch (error) {
    console.error('Custom skill create error:', error)
    return NextResponse.json({ error: 'Lỗi khi tạo custom skill' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { slug, name, content, enabled, version } = body

    if (!slug) {
      return NextResponse.json({ error: 'Thiếu slug' }, { status: 400 })
    }

    const existing = await db.agentSkill.findUnique({
      where: { agentId_slug: { agentId: 'default', slug } },
    })
    if (!existing) {
      return NextResponse.json({ error: `Skill "${slug}" không tồn tại` }, { status: 404 })
    }
    if (existing.source === 'bundled') {
      return NextResponse.json({ error: 'Không thể sửa skill mặc định. Vui lòng tạo skill custom mới.' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (content !== undefined) updateData.content = content
    if (enabled !== undefined) updateData.enabled = enabled
    if (version !== undefined) updateData.version = version

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Không có dữ liệu cập nhật' }, { status: 400 })
    }

    const skill = await db.agentSkill.update({
      where: { agentId_slug: { agentId: 'default', slug } },
      data: updateData,
    })

    // Sync SKILL.md to filesystem based on enabled state and content
    try {
      const skillFilePath = join(process.cwd(), 'skills', slug, 'SKILL.md')
      const isEnabled = skill.enabled
      if (isEnabled) {
        const skillsDir = join(process.cwd(), 'skills', slug)
        mkdirSync(skillsDir, { recursive: true })
        writeFileSync(skillFilePath, skill.content, 'utf-8')
        console.log(`[Skills] Synced custom SKILL.md to filesystem: skills/${slug}/SKILL.md`)
      } else {
        if (existsSync(skillFilePath)) {
          unlinkSync(skillFilePath)
          console.log(`[Skills] Removed custom SKILL.md from filesystem (disabled): skills/${slug}/SKILL.md`)
        }
      }
    } catch (fsErr) {
      console.warn(`[Skills] Failed to sync custom SKILL.md to filesystem:`, fsErr instanceof Error ? fsErr.message : String(fsErr))
    }

    return NextResponse.json({ success: true, skill, message: `Skill "${skill.name}" đã cập nhật` })
  } catch (error) {
    console.error('Custom skill update error:', error)
    return NextResponse.json({ error: 'Lỗi khi cập nhật skill' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const slug = searchParams.get('slug')

  if (!slug) {
    return NextResponse.json({ error: 'Thiếu slug' }, { status: 400 })
  }

  const existing = await db.agentSkill.findUnique({
    where: { agentId_slug: { agentId: 'default', slug } },
  })
  if (!existing) {
    return NextResponse.json({ error: `Skill "${slug}" không tồn tại` }, { status: 404 })
  }
  if (existing.source === 'bundled') {
    return NextResponse.json({ error: 'Không thể xóa skill mặc định' }, { status: 400 })
  }
  // clawhub skills should be uninstalled via the main skills route
  if (existing.source === 'clawhub') {
    return NextResponse.json({ error: 'Dùng action uninstall để gỡ ClawHub skill' }, { status: 400 })
  }

  await db.agentSkill.delete({
    where: { agentId_slug: { agentId: 'default', slug } },
  })

  // Remove SKILL.md from filesystem and clean up empty directory
  try {
    const skillDir = join(process.cwd(), 'skills', slug)
    const skillFilePath = join(skillDir, 'SKILL.md')
    if (existsSync(skillFilePath)) {
      unlinkSync(skillFilePath)
      console.log(`[Skills] Removed custom SKILL.md from filesystem: skills/${slug}/SKILL.md`)
    }
    // Clean up empty directory
    if (existsSync(skillDir)) {
      try {
        const files = readdirSync(skillDir)
        if (files.length === 0) rmdirSync(skillDir)
      } catch {}
    }
  } catch (fsErr) {
    console.warn(`[Skills] Failed to remove custom SKILL.md from filesystem:`, fsErr instanceof Error ? fsErr.message : String(fsErr))
  }

  return NextResponse.json({ success: true, message: `Skill "${existing.name}" đã xóa` })
}
