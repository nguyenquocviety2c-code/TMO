/**
 * Chat Messages API — Persist and Retrieve Session Messages
 *
 * GET    /api/chat-messages   — Get messages for a session (query param: sessionId)
 * POST   /api/chat-messages   — Save messages for a session
 * DELETE /api/chat-messages   — Delete all messages for a session (query param: sessionId)
 */

import { NextRequest, NextResponse } from 'next/server'
import { saveChatMessages, getSessionMessages } from '@/lib/agent-memory'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// ==================== GET — GET SESSION MESSAGES ====================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      )
    }

    const messages = await getSessionMessages(sessionId)

    return NextResponse.json({ messages })
  } catch (err) {
    console.error('[ChatMessagesAPI] GET error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json(
      { error: 'Failed to get session messages', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}

// ==================== POST — SAVE SESSION MESSAGES ====================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, messages } = body

    // Validate required fields
    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages must be a non-empty array' }, { status: 400 })
    }

    // Validate each message has required fields
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      if (!msg.role || typeof msg.role !== 'string') {
        return NextResponse.json(
          { error: `messages[${i}].role is required and must be a string` },
          { status: 400 }
        )
      }
      if (!msg.content || typeof msg.content !== 'string') {
        return NextResponse.json(
          { error: `messages[${i}].content is required and must be a string` },
          { status: 400 }
        )
      }
    }

    // Normalize messages for storage
    const normalizedMessages = messages.map((msg: {
      role: string
      content: string
      model?: string
      provider?: string
      metadata?: Record<string, unknown>
    }) => ({
      role: msg.role,
      content: msg.content,
      model: msg.model || undefined,
      provider: msg.provider || undefined,
      metadata: msg.metadata || undefined,
    }))

    const saved = await saveChatMessages(sessionId, normalizedMessages)

    return NextResponse.json({ saved }, { status: 201 })
  } catch (err) {
    console.error('[ChatMessagesAPI] POST error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json(
      { error: 'Failed to save chat messages', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}

// ==================== DELETE — DELETE SESSION MESSAGES ====================

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      )
    }

    const result = await db.chatMessage.deleteMany({
      where: { sessionId },
    })

    return NextResponse.json({ success: true, deletedCount: result.count })
  } catch (err) {
    console.error('[ChatMessagesAPI] DELETE error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json(
      { error: 'Failed to delete chat messages', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
