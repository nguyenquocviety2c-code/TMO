import { NextResponse } from 'next/server'
import { getLSPDiagnostics } from '@/lib/opencode'

export const dynamic = 'force-dynamic'

/**
 * POST /api/opencode/lsp/diagnostics
 * Get LSP diagnostics from OpenCode server
 * Body: { filePath?: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { filePath } = body

    const diagnostics = await getLSPDiagnostics(filePath)

    return NextResponse.json({
      diagnostics,
      source: 'opencode-server',
      filePath: filePath || 'all',
    })
  } catch (error) {
    return NextResponse.json({
      diagnostics: [],
      error: error instanceof Error ? error.message : 'Unknown error',
      source: 'opencode-server',
    })
  }
}
