/**
 * MCP Bridge Sync — Magnum Opus
 * 
 * POST /api/opencode/mcp/sync
 * Synchronize MCP tools between OpenClaw and OpenCode:
 * 1. Ensure all outbound tools (OpenClaw → OpenCode) are configured
 * 2. Register all inbound tools (OpenCode → OpenClaw) as Skills
 * 3. Update MCPBridgeConfig table with current state
 * 4. Verify MCP bridge server connectivity
 */

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isOpenCodeOnline } from '@/lib/opencode'

export const dynamic = 'force-dynamic'

// Default outbound tools (OpenClaw → OpenCode via MCP)
const DEFAULT_OUTBOUND_TOOLS = [
  { direction: 'outbound', toolName: 'knowledge_search', enabled: true, config: '{"endpoint":"/api/openclaw/tools/knowledge-search"}' },
  { direction: 'outbound', toolName: 'knowledge_graph', enabled: true, config: '{"endpoint":"/api/openclaw/tools/knowledge-graph"}' },
  { direction: 'outbound', toolName: 'knowledge_write', enabled: true, config: '{"endpoint":"/api/openclaw/tools/knowledge-write"}' },
  { direction: 'outbound', toolName: 'web_search', enabled: true, config: '{"endpoint":"/api/openclaw/tools/knowledge-search","webSearch":true}' },
]

// Default inbound tools (OpenCode → OpenClaw as Skills)
const DEFAULT_INBOUND_TOOLS = [
  { direction: 'inbound', toolName: 'file_read', enabled: true, config: '{"skillSlug":"opencode-file-read"}' },
  { direction: 'inbound', toolName: 'file_edit', enabled: true, config: '{"skillSlug":"opencode-file-edit"}' },
  { direction: 'inbound', toolName: 'bash_exec', enabled: true, config: '{"skillSlug":"opencode-bash-exec"}' },
  { direction: 'inbound', toolName: 'lsp_diag', enabled: true, config: '{"skillSlug":"opencode-lsp-diag"}' },
  { direction: 'inbound', toolName: 'fetch_url', enabled: true, config: '{"skillSlug":"opencode-fetch-url"}' },
]

export async function POST() {
  try {
    const syncResults = {
      outboundSynced: 0,
      inboundSynced: 0,
      skillsRegistered: 0,
      skillsUpdated: 0,
      opencodeOnline: false,
      errors: [] as string[],
    }

    // Check OpenCode server connectivity
    try {
      syncResults.opencodeOnline = await isOpenCodeOnline()
    } catch {
      syncResults.opencodeOnline = false
    }

    // 1. Sync outbound tools
    for (const tool of DEFAULT_OUTBOUND_TOOLS) {
      try {
        await db.mCPBridgeConfig.upsert({
          where: { direction_toolName: { direction: tool.direction, toolName: tool.toolName } },
          update: { config: tool.config },
          create: tool,
        })
        syncResults.outboundSynced++
      } catch (err) {
        syncResults.errors.push(`outbound:${tool.toolName} — ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // 2. Sync inbound tools
    for (const tool of DEFAULT_INBOUND_TOOLS) {
      try {
        await db.mCPBridgeConfig.upsert({
          where: { direction_toolName: { direction: tool.direction, toolName: tool.toolName } },
          update: { config: tool.config },
          create: tool,
        })
        syncResults.inboundSynced++
      } catch (err) {
        syncResults.errors.push(`inbound:${tool.toolName} — ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // 3. Register inbound tools as OpenClaw Skills (use same content as register route for consistency)
    const opencodeSkills = [
      { slug: 'opencode-file-read', name: 'File Read (OpenCode)', content: '# File Read\n\n## Description\nRead file contents from the workspace using OpenCode.\n\n## When to Use\n- When you need to see the contents of a file\n- When debugging code issues\n- When reviewing code changes\n\n## How to Use\n1. Provide the file path\n2. OpenCode will read and return the contents\n3. Syntax highlighting applied automatically\n\n## Rules\n- Only read files within the workspace\n- Do not read binary files\n- Respect .gitignore rules', source: 'opencode', version: '1.0.0' },
      { slug: 'opencode-file-edit', name: 'File Edit (OpenCode)', content: '# File Edit\n\n## Description\nEdit file contents using OpenCode\'s intelligent editing system.\n\n## When to Use\n- When fixing bugs in code\n- When refactoring code\n- When applying suggested changes\n\n## How to Use\n1. Provide the file path and edit instructions\n2. OpenCode will apply changes using its edit tool\n3. LSP diagnostics will validate the changes\n\n## Rules\n- ALWAYS ask user before making destructive changes\n- Create backup before major edits\n- Verify with LSP after editing', source: 'opencode', version: '1.0.0' },
      { slug: 'opencode-bash-exec', name: 'Bash Execute (OpenCode)', content: '# Bash Execute\n\n## Description\nExecute bash commands in the workspace using OpenCode.\n\n## When to Use\n- When running tests\n- When installing dependencies\n- When building the project\n- When checking git status\n\n## How to Use\n1. Provide the bash command\n2. OpenCode will execute in workspace shell\n3. Output is captured and returned\n\n## Rules\n- NEVER run destructive commands (rm -rf, etc.) without confirmation\n- Always use --dry-run when available\n- Timeout after 30 seconds', source: 'opencode', version: '1.0.0' },
      { slug: 'opencode-lsp-diag', name: 'LSP Diagnostics (OpenCode)', content: '# LSP Diagnostics\n\n## Description\nGet Language Server Protocol diagnostics for workspace files.\n\n## When to Use\n- When checking for type errors\n- When reviewing code quality\n- After making code changes\n\n## How to Use\n1. Optionally provide a file path (or get all diagnostics)\n2. OpenCode will query LSP servers\n3. Returns errors, warnings, and hints\n\n## Rules\n- Results depend on LSP server availability\n- TypeScript LSP is pre-configured\n- Other languages can be added via config', source: 'opencode', version: '1.0.0' },
      { slug: 'opencode-fetch-url', name: 'Fetch URL (OpenCode)', content: '# Fetch URL\n\n## Description\nFetch content from a URL using OpenCode\'s fetch tool.\n\n## When to Use\n- When reading documentation online\n- When downloading files\n- When checking API responses\n\n## How to Use\n1. Provide the URL\n2. OpenCode will fetch and return content\n3. Content is automatically cleaned and formatted\n\n## Rules\n- Only fetch HTTPS URLs\n- Respect robots.txt\n- Timeout after 10 seconds', source: 'opencode', version: '1.0.0' },
    ]

    for (const skill of opencodeSkills) {
      try {
        const existing = await db.agentSkill.findFirst({
          where: { slug: skill.slug, agentId: 'default' },
        })
        if (existing) {
          await db.agentSkill.update({
            where: { id: existing.id },
            data: { name: skill.name, content: skill.content, version: skill.version },
          })
          syncResults.skillsUpdated++
        } else {
          await db.agentSkill.create({
            data: {
              agentId: 'default',
              slug: skill.slug,
              name: skill.name,
              content: skill.content,
              source: skill.source,
              enabled: true,
              version: skill.version,
            },
          })
          syncResults.skillsRegistered++
        }
      } catch (err) {
        syncResults.errors.push(`skill:${skill.slug} — ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // 4. Build final status
    const allConfigs = await db.mCPBridgeConfig.findMany()
    const finalStatus = {
      outbound: {
        description: 'OpenClaw Tools exposed as MCP servers for OpenCode',
        tools: allConfigs
          .filter(c => c.direction === 'outbound')
          .map(c => ({ name: c.toolName, enabled: c.enabled, source: 'openclaw' })),
      },
      inbound: {
        description: 'OpenCode Tools registered as OpenClaw Skills',
        tools: allConfigs
          .filter(c => c.direction === 'inbound')
          .map(c => ({ name: c.toolName, enabled: c.enabled, source: 'opencode' })),
      },
      bridgeStatus: syncResults.opencodeOnline ? 'active' : 'degraded',
      lastSync: new Date().toISOString(),
    }

    return NextResponse.json({
      success: true,
      sync: syncResults,
      status: finalStatus,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Sync failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
