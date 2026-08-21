/**
 * Smolab Session Manager — Isolation & Validation
 * 
 * Rules:
 *   1. Chat PHẢI có agentProfileId (single mode) hoặc teamName (multi mode)
 *   2. Sessions chỉ hiển thị cho agent/team đang chọn
 *   3. Không thể chat mà chưa chọn agent/team
 *   4. Mỗi session thuộc đúng 1 agent hoặc 1 team
 */

import { db } from '@/lib/db'

// ==================== VALIDATION ====================

export interface ChatContext {
  mode: 'single' | 'multi'
  agentProfileId?: string | null
  teamName?: string | null
  sessionId?: string | null
}

/** Validate chat context — throw nếu thiếu agent/team */
export function validateChatContext(ctx: ChatContext): {
  valid: boolean
  error?: string
} {
  if (ctx.mode === 'single') {
    if (!ctx.agentProfileId) {
      return { valid: false, error: 'Vui lòng chọn Agent trước khi chat' }
    }
  } else if (ctx.mode === 'multi') {
    if (!ctx.teamName) {
      return { valid: false, error: 'Vui lòng chọn Team trước khi chat' }
    }
  } else {
    return { valid: false, error: 'Chế độ chat không hợp lệ' }
  }
  return { valid: true }
}

// ==================== SESSION ISOLATION ====================

/** Lấy sessions cho 1 agent cụ thể (single mode) */
export async function getSessionsForAgent(agentProfileId: string) {
  return db.agentSession.findMany({
    where: {
      agentProfileId,
      teamMode: 'single',
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      tasks: {
        where: { status: { in: ['pending', 'running'] } },
        select: { id: true, type: true, status: true, progress: true, inputSummary: true },
      },
    },
  })
}

/** Lấy sessions cho 1 team cụ thể (multi mode) */
export async function getSessionsForTeam(teamName: string) {
  return db.agentSession.findMany({
    where: {
      teamName,
      teamMode: 'multi',
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      tasks: {
        where: { status: { in: ['pending', 'running'] } },
        select: { id: true, type: true, status: true, progress: true, inputSummary: true },
      },
    },
  })
}

/** Tạo session mới với isolation — BẮT BUỘC có agentProfileId hoặc teamName */
export async function createIsolatedSession(params: {
  mode: 'single' | 'multi'
  agentProfileId?: string
  teamName?: string
  title?: string
  model?: string
  provider?: string
}) {
  const { mode, agentProfileId, teamName, title, model, provider } = params

  // Validate
  const validation = validateChatContext({ mode, agentProfileId, teamName })
  if (!validation.valid) {
    throw new Error(validation.error)
  }

  // Tạo sessionId unique
  const sessionId = `${mode === 'single' ? 'agent' : 'team'}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  // Nếu multi mode, tìm TL agent để gán agentProfileId
  let resolvedAgentProfileId = agentProfileId
  if (mode === 'multi' && teamName) {
    const tl = await db.agentProfile.findFirst({
      where: { team: teamName, position: 'TL', enabled: true },
    })
    if (tl) resolvedAgentProfileId = tl.id
  }

  return db.agentSession.create({
    data: {
      sessionId,
      agentId: resolvedAgentProfileId || 'default',
      agentProfileId: resolvedAgentProfileId || null,
      teamMode: mode,
      teamName: mode === 'multi' ? teamName : null,
      title: title || `${mode === 'single' ? 'Agent' : 'Team'} Chat`,
      model: model || null,
      provider: provider || null,
    },
  })
}

/** Xóa session — chỉ cho phép xóa session của agent/team đang chọn */
export async function deleteIsolatedSession(params: {
  sessionId: string
  mode: 'single' | 'multi'
  agentProfileId?: string
  teamName?: string
}) {
  const { sessionId, mode, agentProfileId, teamName } = params

  // Verify ownership
  const session = await db.agentSession.findUnique({
    where: { sessionId },
  })

  if (!session) {
    throw new Error('Session không tồn tại')
  }

  // Kiểm tra session thuộc agent/team đang chọn
  if (mode === 'single' && session.agentProfileId !== agentProfileId) {
    throw new Error('Không có quyền xóa session này')
  }
  if (mode === 'multi' && session.teamName !== teamName) {
    throw new Error('Không có quyền xóa session này')
  }

  // Cancel running tasks first
  await db.smolabTask.updateMany({
    where: { sessionId, status: { in: ['pending', 'running'] } },
    data: { status: 'cancelled' },
  })

  // Delete messages, then session
  await db.chatMessage.deleteMany({ where: { sessionId } })
  await db.smolabTask.deleteMany({ where: { sessionId } })
  return db.agentSession.delete({ where: { sessionId } })
}
