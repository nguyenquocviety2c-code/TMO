import { NextResponse } from 'next/server'
import { listOpenCodeTools } from '@/lib/opencode'

export const dynamic = 'force-dynamic'

/**
 * GET /api/opencode/tools
 * List available tools from OpenCode server
 */
export async function GET() {
  try {
    const tools = await listOpenCodeTools()
    return NextResponse.json({ tools, total: tools.length, source: 'opencode-server' })
  } catch {
    // Fallback: static tool list
    return NextResponse.json({
      tools: [
        { name: 'file_read', description: 'Read file content from workspace', category: 'file', source: 'builtin', dangerous: false },
        { name: 'file_edit', description: 'Edit file content in workspace', category: 'file', source: 'builtin', dangerous: true },
        { name: 'bash_exec', description: 'Execute bash commands in workspace', category: 'system', source: 'builtin', dangerous: true },
        { name: 'lsp_diag', description: 'Get LSP diagnostics (TypeScript)', category: 'code', source: 'builtin', dangerous: false },
        { name: 'fetch_url', description: 'Fetch content from URL', category: 'network', source: 'builtin', dangerous: false },
      ],
      total: 5,
      source: 'local-fallback',
    })
  }
}
