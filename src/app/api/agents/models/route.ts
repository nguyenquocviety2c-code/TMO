/**
 * Agent Models API — Provider & Model list for Agent creation
 *
 * GET /api/agents/models           — List all providers with their models
 * GET /api/agents/models?provider=nvidia  — List models for specific provider
 */

import { NextRequest, NextResponse } from 'next/server'
import { PROVIDER_DATA, PROVIDER_MODELS } from '@/lib/agent-constants'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const provider = searchParams.get('provider')

    if (provider) {
      // Return models for specific provider
      const providerData = PROVIDER_DATA.find(p => p.key === provider)
      if (!providerData) {
        return NextResponse.json(
          { error: `Provider "${provider}" không tồn tại. Khả dụng: ${PROVIDER_DATA.map(p => p.key).join(', ')}` },
          { status: 400 }
        )
      }
      return NextResponse.json({
        provider: providerData,
        models: PROVIDER_MODELS[provider],
      })
    }

    // Return all providers with their models
    return NextResponse.json({
      providers: PROVIDER_DATA,
      totalProviders: PROVIDER_DATA.length,
      totalModels: PROVIDER_DATA.reduce((sum, p) => sum + p.models.length, 0),
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to list models', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
