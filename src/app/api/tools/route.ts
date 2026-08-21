/**
 * GET /api/tools — List ALL tools (custom + local + gateway) with metadata
 *
 * Query params:
 *   source=custom|local|gateway|all   (default: all)
 *   enabled=true|false                (default: all — only applies to custom tools)
 *   category=...                      (filter by category)
 *
 * Merges custom tools from DB with existing tool data from the openclaw tools catalog.
 * Custom tools are deduplicated against local/gateway tools.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAllCustomTools } from '@/lib/custom-tool-registry'
import { GATEWAY_TOOL_REGISTRY, SESSION_CONTEXT_TOOLS, HTTP_ACCESSIBLE_TOOLS } from '@/lib/openclaw'
import { tavilyKeyPool, jinaKeyPool, serperKeyPool } from '@/lib/service-key-pool'

export const dynamic = 'force-dynamic'

const BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || 'http://127.0.0.1:18791'

// Local tool definitions (mirrored from /api/openclaw/tools for merging)
const LOCAL_TOOLS = [
  {
    name: 'opencode',
    category: 'Code',
    description: 'Read/write files, execute terminal commands. Used by Code Team for code implementation.',
    source: 'local' as const,
    dangerous: true,
    implemented: true,
    apiKeyEnv: '',
    hasApiKey: true,
  },
  {
    name: 'knowledge_search',
    category: 'Knowledge',
    description: 'Semantic search in Knowledge Base (Qdrant + Neo4j). All agents can use.',
    source: 'local' as const,
    dangerous: false,
    implemented: true,
    apiKeyEnv: '',
    hasApiKey: true,
  },
  {
    name: 'knowledge_graph',
    category: 'Knowledge',
    description: 'Query Neo4j graph with Cypher (read-only MATCH). All agents can use.',
    source: 'local' as const,
    dangerous: false,
    implemented: true,
    apiKeyEnv: '',
    hasApiKey: true,
  },
  {
    name: 'knowledge_write',
    category: 'Knowledge',
    description: 'Write entity/relationship to Knowledge Base. Use with caution.',
    source: 'local' as const,
    dangerous: true,
    implemented: true,
    apiKeyEnv: '',
    hasApiKey: true,
  },
  {
    name: 'tavily',
    category: 'Web',
    description: 'Deep web search AI-optimized. Returns results with summaries + answer.',
    source: 'local' as const,
    dangerous: false,
    implemented: true,
    apiKeyEnv: 'TAVILY_API_KEY_1..4',
    hasApiKey: tavilyKeyPool.hasKeys(),
  },
  {
    name: 'serper',
    category: 'Web',
    description: 'Google Search API. Returns organic results with titles, snippets, links.',
    source: 'local' as const,
    dangerous: false,
    implemented: true,
    apiKeyEnv: 'SERPER_API_KEY_1..4',
    hasApiKey: serperKeyPool.hasKeys(),
  },
  {
    name: 'jina',
    category: 'Web',
    description: 'Web page reader. Reads content from URL.',
    source: 'local' as const,
    dangerous: false,
    implemented: true,
    apiKeyEnv: 'JINA_API_KEY_1..2',
    hasApiKey: jinaKeyPool.hasKeys(),
  },
]

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sourceFilter = searchParams.get('source') || 'all'
    const enabledFilter = searchParams.get('enabled')
    const categoryFilter = searchParams.get('category')

    // ===== Check Bridge status =====
    let bridgeOnline = false
    try {
      const res = await fetch(`${BRIDGE_URL}/health`, { signal: AbortSignal.timeout(3000) })
      if (res.ok) {
        const data = await res.json()
        bridgeOnline = data?.bridge?.authenticated === true
      }
    } catch {
      // Bridge unavailable — ok
    }

    // ===== Build local tools list =====
    const localTools = LOCAL_TOOLS.map(t => ({
      name: t.name,
      category: t.category,
      description: t.description,
      source: 'local' as const,
      accessMode: 'local' as const,
      dangerous: t.dangerous,
      implemented: t.implemented,
      apiKeyEnv: t.apiKeyEnv,
      hasApiKey: t.hasApiKey,
      enabled: true, // Local tools are always enabled
    }))

    // ===== Build gateway tools list =====
    const gatewayTools = GATEWAY_TOOL_REGISTRY.map(t => {
      const isSessionContext = SESSION_CONTEXT_TOOLS.has(t.name)
      const isHttpAccessible = HTTP_ACCESSIBLE_TOOLS.has(t.name)
      const accessMode = isSessionContext
        ? (bridgeOnline ? 'bridge' : 'unavailable')
        : 'http'

      return {
        name: t.name,
        category: t.category,
        description: t.description,
        source: 'gateway' as const,
        accessMode,
        sessionContext: isSessionContext,
        dangerous: isSessionContext && ['exec', 'write', 'edit', 'apply_patch', 'code_execution', 'process'].includes(t.name),
        implemented: true,
        apiKeyEnv: '',
        hasApiKey: true,
        enabled: true, // Gateway tools are always enabled
      }
    })

    // ===== Build custom tools list =====
    // Get from in-memory registry for fast access
    const customToolEntries = getAllCustomTools()

    // Also query DB for any tools not yet in memory (e.g., disabled ones)
    const dbCustomTools = await db.customTool.findMany()
    const dbToolMap = new Map(dbCustomTools.map(t => [t.name, t]))

    // Merge: prefer in-memory entries, add DB-only entries
    const allCustomNames = new Set([
      ...customToolEntries.map(t => t.name),
      ...dbCustomTools.map(t => t.name),
    ])

    const customTools: Array<{
      name: string
      category: string
      description: string
      source: string
      accessMode: string
      dangerous: boolean
      implemented: boolean
      enabled: boolean
      isPublic: boolean
      version: string
      skillSlug: string | null
      callCount: number
      handlerCode?: string
    }> = []

    for (const toolName of allCustomNames) {
      const memEntry = customToolEntries.find(t => t.name === toolName)
      const dbEntry = dbToolMap.get(toolName)

      if (memEntry) {
        customTools.push({
          name: memEntry.name,
          category: memEntry.category,
          description: memEntry.description,
          source: 'custom',
          accessMode: 'custom',
          dangerous: false,
          implemented: true,
          enabled: memEntry.enabled,
          isPublic: memEntry.isPublic,
          version: memEntry.version,
          skillSlug: memEntry.skillSlug,
          callCount: memEntry.callCount,
          handlerCode: memEntry.handlerCode,
        })
      } else if (dbEntry) {
        // Tool is in DB but not in memory (e.g., disabled)
        let parameters: Record<string, unknown>
        try {
          parameters = JSON.parse(dbEntry.parameters)
        } catch {
          parameters = { type: 'object', properties: {} }
        }
        customTools.push({
          name: dbEntry.name,
          category: dbEntry.category,
          description: dbEntry.description,
          source: 'custom',
          accessMode: 'custom',
          dangerous: false,
          implemented: true,
          enabled: dbEntry.enabled,
          isPublic: dbEntry.isPublic,
          version: dbEntry.version,
          skillSlug: dbEntry.skillSlug,
          callCount: dbEntry.callCount,
          handlerCode: dbEntry.handlerCode,
        })
        // Suppress unused variable warning
        void parameters
      }
    }

    // ===== Merge all tools, avoiding duplicates =====
    const localAndGatewayNames = new Set([
      ...localTools.map(t => t.name),
      ...gatewayTools.map(t => t.name),
    ])

    // Custom tools should not duplicate local/gateway tools
    const uniqueCustomTools = customTools.filter(t => !localAndGatewayNames.has(t.name))

    let allTools: Array<Record<string, unknown>> = [
      ...localTools,
      ...gatewayTools.filter(t => !localTools.some(l => l.name === t.name)),
      ...uniqueCustomTools,
    ]

    // ===== Apply filters =====

    // Filter by source
    if (sourceFilter !== 'all') {
      allTools = allTools.filter(t => t.source === sourceFilter)
    }

    // Filter by enabled (only meaningful for custom tools)
    if (enabledFilter !== null && enabledFilter !== undefined) {
      const isEnabled = enabledFilter === 'true'
      allTools = allTools.filter(t => {
        // Local and gateway tools are always enabled
        if (t.source !== 'custom') return isEnabled === true
        return t.enabled === isEnabled
      })
    }

    // Filter by category
    if (categoryFilter) {
      allTools = allTools.filter(t =>
        (t.category as string).toLowerCase() === categoryFilter.toLowerCase()
      )
    }

    // ===== Get permissions =====
    const permissions = await db.toolPermission.findMany({
      where: { agentId: 'default' },
    })
    const permMap = new Map(permissions.map(p => [p.toolName, p.permission]))

    // Merge with permissions
    const toolsWithPermissions = allTools.map(t => ({
      ...t,
      permission: permMap.get(t.name as string) || ((t.dangerous as boolean) ? 'ask' : 'allow'),
    }))

    // ===== Stats =====
    const local = allTools.filter(t => t.source === 'local').length
    const gatewayHttp = allTools.filter(t => t.accessMode === 'http').length
    const gatewayBridge = allTools.filter(t => t.accessMode === 'bridge').length
    const custom = allTools.filter(t => t.source === 'custom').length
    const unavailable = allTools.filter(t => t.accessMode === 'unavailable').length
    const categories = [...new Set(allTools.map(t => t.category as string))]

    return NextResponse.json({
      tools: toolsWithPermissions,
      total: toolsWithPermissions.length,
      bridge: {
        online: bridgeOnline,
      },
      stats: {
        local,
        gatewayHttp,
        gatewayBridge,
        custom,
        unavailable,
        total: allTools.length,
        accessibleTotal: local + gatewayHttp + gatewayBridge + custom,
      },
      categories,
    })
  } catch (err) {
    console.error('[Tools:List] Error:', err)
    return NextResponse.json(
      { error: 'Failed to list tools', detail: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
