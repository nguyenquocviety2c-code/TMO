/**
 * User Profile API — Long-term User Knowledge
 *
 * GET    /api/user-profile   — Get user profile (query params: userId, default "default")
 * POST   /api/user-profile   — Update or create a profile entry
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserProfile, updateUserProfile } from '@/lib/agent-memory'

export const dynamic = 'force-dynamic'

// ==================== GET — GET USER PROFILE ====================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId') || 'default'

    const profile = await getUserProfile(userId)

    return NextResponse.json({ profile })
  } catch (err) {
    console.error('[UserProfileAPI] GET error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json(
      { error: 'Failed to get user profile', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}

// ==================== POST — UPDATE USER PROFILE ====================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, key, value, source, confidence } = body

    // Validate required fields
    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: 'key is required' }, { status: 400 })
    }

    if (!value || typeof value !== 'string') {
      return NextResponse.json({ error: 'value is required' }, { status: 400 })
    }

    // Validate optional fields
    if (confidence !== undefined && (typeof confidence !== 'number' || confidence < 0 || confidence > 1)) {
      return NextResponse.json({ error: 'confidence must be a number between 0 and 1' }, { status: 400 })
    }

    const entry = await updateUserProfile({
      userId: userId || 'default',
      key,
      value,
      source: source || undefined,
      confidence: confidence ?? undefined,
    })

    if (!entry) {
      return NextResponse.json(
        { error: 'Failed to update user profile' },
        { status: 500 }
      )
    }

    return NextResponse.json(entry, { status: 201 })
  } catch (err) {
    console.error('[UserProfileAPI] POST error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json(
      { error: 'Failed to update user profile', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
