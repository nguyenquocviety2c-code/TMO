/**
 * MCP Bridge Register — Magnum Opus
 * 
 * POST /api/opencode/mcp/register
 * Register OpenCode tools as OpenClaw Skills in the database.
 * 
 * GET /api/opencode/mcp/register
 * Get the current MCP tool registration status.
 */

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// OpenCode tools to register as OpenClaw Skills
const OPENCODE_TOOLS_AS_SKILLS = [
  {
    slug: 'opencode-file-read',
    name: 'File Read (OpenCode)',
    content: `# File Read\n\n## Description\nRead file contents from the workspace using OpenCode.\n\n## When to Use\n- When you need to see the contents of a file\n- When debugging code issues\n- When reviewing code changes\n\n## How to Use\n1. Provide the file path\n2. OpenCode will read and return the contents\n3. Syntax highlighting applied automatically\n\n## Rules\n- Only read files within the workspace\n- Do not read binary files\n- Respect .gitignore rules`,
    source: 'opencode',
    enabled: true,
    version: '1.0.0',
  },
  {
    slug: 'opencode-file-edit',
    name: 'File Edit (OpenCode)',
    content: `# File Edit\n\n## Description\nEdit file contents using OpenCode's intelligent editing system.\n\n## When to Use\n- When fixing bugs in code\n- When refactoring code\n- When applying suggested changes\n\n## How to Use\n1. Provide the file path and edit instructions\n2. OpenCode will apply changes using its edit tool\n3. LSP diagnostics will validate the changes\n\n## Rules\n- ALWAYS ask user before making destructive changes\n- Create backup before major edits\n- Verify with LSP after editing`,
    source: 'opencode',
    enabled: true,
    version: '1.0.0',
  },
  {
    slug: 'opencode-bash-exec',
    name: 'Bash Execute (OpenCode)',
    content: `# Bash Execute\n\n## Description\nExecute bash commands in the workspace using OpenCode.\n\n## When to Use\n- When running tests\n- When installing dependencies\n- When building the project\n- When checking git status\n\n## How to Use\n1. Provide the bash command\n2. OpenCode will execute in workspace shell\n3. Output is captured and returned\n\n## Rules\n- NEVER run destructive commands (rm -rf, etc.) without confirmation\n- Always use --dry-run when available\n- Timeout after 30 seconds`,
    source: 'opencode',
    enabled: true,
    version: '1.0.0',
  },
  {
    slug: 'opencode-lsp-diag',
    name: 'LSP Diagnostics (OpenCode)',
    content: `# LSP Diagnostics\n\n## Description\nGet Language Server Protocol diagnostics for workspace files.\n\n## When to Use\n- When checking for type errors\n- When reviewing code quality\n- After making code changes\n\n## How to Use\n1. Optionally provide a file path (or get all diagnostics)\n2. OpenCode will query LSP servers\n3. Returns errors, warnings, and hints\n\n## Rules\n- Results depend on LSP server availability\n- TypeScript LSP is pre-configured\n- Other languages can be added via config`,
    source: 'opencode',
    enabled: true,
    version: '1.0.0',
  },
  {
    slug: 'opencode-fetch-url',
    name: 'Fetch URL (OpenCode)',
    content: `# Fetch URL\n\n## Description\nFetch content from a URL using OpenCode's fetch tool.\n\n## When to Use\n- When reading documentation online\n- When downloading files\n- When checking API responses\n\n## How to Use\n1. Provide the URL\n2. OpenCode will fetch and return content\n3. Content is automatically cleaned and formatted\n\n## Rules\n- Only fetch HTTPS URLs\n- Respect robots.txt\n- Timeout after 10 seconds`,
    source: 'opencode',
    enabled: true,
    version: '1.0.0',
  },
]

/**
 * POST /api/opencode/mcp/register
 * Register OpenCode tools as OpenClaw Skills
 */
export async function POST() {
  try {
    let registered = 0
    let updated = 0

    for (const tool of OPENCODE_TOOLS_AS_SKILLS) {
      try {
        const existing = await db.agentSkill.findFirst({
          where: { slug: tool.slug, agentId: 'default' },
        })

        if (existing) {
          await db.agentSkill.update({
            where: { id: existing.id },
            data: {
              name: tool.name,
              content: tool.content,
              version: tool.version,
              source: tool.source,
            },
          })
          updated++
        } else {
          await db.agentSkill.create({
            data: {
              agentId: 'default',
              slug: tool.slug,
              name: tool.name,
              content: tool.content,
              source: tool.source,
              enabled: tool.enabled,
              version: tool.version,
            },
          })
          registered++
        }
      } catch (err) {
        console.warn(`[MCP Register] Failed to register ${tool.slug}:`, err instanceof Error ? err.message : String(err))
      }
    }

    // Also ensure inbound MCPBridgeConfig entries exist
    for (const tool of OPENCODE_TOOLS_AS_SKILLS) {
      const toolName = tool.slug.replace('opencode-', '').replace(/-/g, '_')
      try {
        await db.mCPBridgeConfig.upsert({
          where: { direction_toolName: { direction: 'inbound', toolName } },
          update: {},
          create: {
            direction: 'inbound',
            toolName,
            enabled: true,
            config: JSON.stringify({ skillSlug: tool.slug }),
          },
        })
      } catch { /* ignore duplicate */ }
    }

    return NextResponse.json({
      success: true,
      registered,
      updated,
      total: OPENCODE_TOOLS_AS_SKILLS.length,
      tools: OPENCODE_TOOLS_AS_SKILLS.map(t => t.slug),
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Registration failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

/**
 * GET /api/opencode/mcp/register
 * Get MCP tool registration status
 */
export async function GET() {
  try {
    // Get registered OpenCode skills
    const opencodeSkills = await db.agentSkill.findMany({
      where: { source: 'opencode' },
    })

    // Get MCP bridge config
    const bridgeConfigs = await db.mCPBridgeConfig.findMany()

    return NextResponse.json({
      registeredSkills: opencodeSkills.map(s => ({
        slug: s.slug,
        name: s.name,
        enabled: s.enabled,
        version: s.version,
        source: s.source,
      })),
      bridgeConfigs: bridgeConfigs.map(c => ({
        direction: c.direction,
        toolName: c.toolName,
        enabled: c.enabled,
      })),
      totalSkills: opencodeSkills.length,
      totalConfigs: bridgeConfigs.length,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get registration status', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
