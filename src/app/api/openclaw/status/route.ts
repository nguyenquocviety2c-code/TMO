/**
 * OpenClaw Status API — Check gateway health
 *
 * GET /api/openclaw/status — Returns gateway connection status
 */

import { NextResponse } from 'next/server'
import { isGatewayOnline } from '@/lib/openclaw'

export const dynamic = 'force-dynamic'

export async function GET() {
  const startTime = Date.now()

  try {
    const result = await isGatewayOnline()

    if (result.online) {
      return NextResponse.json({
        status: 'online',
        responseTimeMs: result.responseTime,
        timestamp: new Date().toISOString(),
      })
    }

    return NextResponse.json({
      status: 'offline',
      responseTimeMs: result.responseTime || Date.now() - startTime,
      error: 'Gateway returned non-ok status',
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json({
      status: 'offline',
      responseTimeMs: Date.now() - startTime,
      error: err instanceof Error ? err.message : 'Gateway unreachable',
      timestamp: new Date().toISOString(),
    })
  }
}
