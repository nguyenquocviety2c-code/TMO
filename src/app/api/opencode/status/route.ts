import { NextResponse } from 'next/server'
import { isOpenCodeOnline, getOpenCodeInfo } from '@/lib/opencode'

export const dynamic = 'force-dynamic'

/**
 * GET /api/opencode/status
 * Check OpenCode server health and return server info
 * Falls back to offline status if server is unreachable
 */
export async function GET() {
  try {
    const online = await isOpenCodeOnline()
    
    if (!online) {
      return NextResponse.json({
        online: false,
        serverInfo: null,
        message: 'OpenCode Server offline — running on port 18790',
        fallback: true,
      })
    }

    const serverInfo = await getOpenCodeInfo()
    
    return NextResponse.json({
      online: true,
      serverInfo,
      message: 'OpenCode Server online',
      fallback: false,
    })
  } catch (error) {
    return NextResponse.json({
      online: false,
      serverInfo: null,
      message: 'Error connecting to OpenCode Server',
      error: error instanceof Error ? error.message : 'Unknown error',
      fallback: true,
    })
  }
}
