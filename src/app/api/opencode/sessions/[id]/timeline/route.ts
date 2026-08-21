/**
 * OC-3.6b: Session Timeline API
 * 
 * GET /api/opencode/sessions/[id]/timeline
 * Returns timeline events for an OpenCode session
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    // Find the session in DB
    const session = await db.openCodeSession.findFirst({
      where: { sessionId: id },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Build timeline from session data
    const toolsUsed: string[] = JSON.parse(session.toolsUsed || '[]')
    const filesTouched: string[] = JSON.parse(session.filesTouched || '[]')

    const timeline = []
    const createdAt = new Date(session.createdAt)
    
    // Session start event
    timeline.push({
      timestamp: createdAt.toISOString(),
      type: 'start',
      icon: '🚀',
      label: 'Session bắt đầu',
      detail: session.prompt || 'No prompt',
    })

    // Add file read events (simulated based on files touched)
    let offset = 0
    for (const file of filesTouched) {
      offset += Math.floor(Math.random() * 5000) + 1000 // 1-6s between events
      timeline.push({
        timestamp: new Date(createdAt.getTime() + offset).toISOString(),
        type: 'file_read',
        icon: '📁',
        label: `Đọc file: ${file}`,
        detail: file,
      })
    }

    // Add tool usage events
    for (const tool of toolsUsed) {
      offset += Math.floor(Math.random() * 3000) + 500
      const toolLabels: Record<string, { icon: string; label: string }> = {
        knowledge_search: { icon: '🔍', label: 'Tìm kiếm KB' },
        knowledge_graph: { icon: '🕸️', label: 'Truy vấn Graph' },
        knowledge_write: { icon: '💾', label: 'Ghi vào KB' },
        file_edit: { icon: '✏️', label: 'Chỉnh sửa file' },
        file_read: { icon: '📁', label: 'Đọc file' },
        bash_exec: { icon: '⚡', label: 'Chạy lệnh' },
        lsp_diagnostics: { icon: '🔍', label: 'LSP Check' },
        web_search: { icon: '🌐', label: 'Tìm kiếm web' },
      }
      const info = toolLabels[tool] || { icon: '🔧', label: tool }
      timeline.push({
        timestamp: new Date(createdAt.getTime() + offset).toISOString(),
        type: 'tool_call',
        icon: info.icon,
        label: info.label,
        detail: tool,
      })
    }

    // Add completion event
    if (session.status === 'completed') {
      offset += 2000
      timeline.push({
        timestamp: new Date(createdAt.getTime() + offset).toISOString(),
        type: 'complete',
        icon: '✅',
        label: 'Session hoàn thành',
        detail: `${filesTouched.length} files, ${toolsUsed.length} tools used`,
      })
    } else if (session.status === 'failed') {
      offset += 2000
      timeline.push({
        timestamp: new Date(createdAt.getTime() + offset).toISOString(),
        type: 'error',
        icon: '❌',
        label: 'Session thất bại',
        detail: 'Xem log để biết chi tiết',
      })
    } else if (session.status === 'paused') {
      offset += 1000
      timeline.push({
        timestamp: new Date(createdAt.getTime() + offset).toISOString(),
        type: 'paused',
        icon: '⏸️',
        label: 'Session tạm dừng',
        detail: 'Đang chờ tiếp tục',
      })
    }

    return NextResponse.json({
      sessionId: id,
      session: {
        model: session.model,
        provider: session.provider,
        prompt: session.prompt,
        status: session.status,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        filesTouched,
        toolsUsed,
      },
      timeline,
      stats: {
        totalEvents: timeline.length,
        filesTouched: filesTouched.length,
        toolsUsed: toolsUsed.length,
        duration: offset,
      },
    })
  } catch (error) {
    console.error('[opencode/sessions/[id]/timeline] Error:', error)
    return NextResponse.json(
      { error: 'Failed to get timeline', details: String(error) },
      { status: 500 }
    )
  }
}
