#!/usr/bin/env node

/**
 * MCP Knowledge Bridge Server — Magnum Opus
 * 
 * Exposes OpenClaw's Knowledge tools as MCP tools for OpenCode.
 * Uses stdio transport (JSON-RPC over stdin/stdout).
 * 
 * Tools provided:
 * - knowledge_search: Semantic search in Knowledge Base
 * - knowledge_graph: Query Neo4j Knowledge Graph
 * - knowledge_write: Write entities/relationships to KB
 * - web_search: Search the web for current information
 * 
 * Usage: This process is spawned by OpenCode as an MCP server.
 * It communicates via stdin/stdout using the MCP protocol (JSON-RPC).
 */

const NEXTJS_URL = process.env.NEXTJS_URL || 'http://127.0.0.1:3000'

// ============================================
// MCP Protocol — JSON-RPC over stdio
// ============================================

function sendMessage(msg) {
  const json = JSON.stringify(msg)
  process.stdout.write(json + '\n')
}

function log(...args) {
  process.stderr.write('[MCP Knowledge Bridge] ' + args.join(' ') + '\n')
}

// Tool definitions
const TOOLS = [
  {
    name: 'knowledge_search',
    description: 'Search the local Knowledge Base using semantic search. Returns relevant chunks, entities, and relationships from Qdrant + Neo4j.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        topK: { type: 'number', description: 'Number of results (default: 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'knowledge_graph',
    description: 'Query the Neo4j Knowledge Graph. Explore entities, find paths, or run read-only Cypher queries.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['explore', 'path', 'query'], description: 'Action type' },
        entityName: { type: 'string', description: 'Entity name (for explore)' },
        fromEntity: { type: 'string', description: 'Source entity (for path)' },
        toEntity: { type: 'string', description: 'Target entity (for path)' },
        cypher: { type: 'string', description: 'Cypher query (for query action, read-only)' },
      },
      required: ['action'],
    },
  },
  {
    name: 'knowledge_write',
    description: 'Write new entities or relationships to the Knowledge Base. Requires user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['create_entity', 'create_relationship'], description: 'Action type' },
        entity: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string' },
            description: { type: 'string' },
            domain: { type: 'string' },
          },
        },
        relationship: {
          type: 'object',
          properties: {
            sourceName: { type: 'string' },
            targetName: { type: 'string' },
            type: { type: 'string' },
            description: { type: 'string' },
          },
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'web_search',
    description: 'Search the web for current information using the configured web search provider.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        num: { type: 'number', description: 'Number of results (default: 5)' },
      },
      required: ['query'],
    },
  },
]

// Handle tool calls
async function handleToolCall(name, args) {
  try {
    let apiUrl
    let body

    switch (name) {
      case 'knowledge_search':
        apiUrl = `${NEXTJS_URL}/api/openclaw/tools/knowledge-search`
        body = { query: args.query, topK: args.topK || 5 }
        break
      case 'knowledge_graph':
        apiUrl = `${NEXTJS_URL}/api/openclaw/tools/knowledge-graph`
        body = args
        break
      case 'knowledge_write':
        apiUrl = `${NEXTJS_URL}/api/openclaw/tools/knowledge-write`
        body = args
        break
      case 'web_search':
        // Web search is proxied through knowledge-search with a prefix marker
        // If a dedicated web search API becomes available, replace this implementation
        apiUrl = `${NEXTJS_URL}/api/openclaw/tools/knowledge-search`
        body = { query: `[web_search] ${args.query}`, topK: args.num || 5 }
        break
      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        }
    }

    log(`Calling ${name} → ${apiUrl}`)
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })

    const data = await response.json()
    log(`${name} returned: ${JSON.stringify(data).substring(0, 200)}...`)

    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    }
  } catch (error) {
    log(`Error in ${name}: ${error.message}`)
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    }
  }
}

// ============================================
// JSON-RPC message handling
// ============================================

let buffer = ''

process.stdin.on('data', async (chunk) => {
  buffer += chunk.toString()
  const lines = buffer.split('\n')
  buffer = lines.pop() || ''

  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const msg = JSON.parse(line)
      await handleMessage(msg)
    } catch (e) {
      log(`Failed to parse message: ${line.substring(0, 100)}`)
    }
  }
})

async function handleMessage(msg) {
  const { jsonrpc, id, method, params } = msg

  if (method === 'initialize') {
    sendMessage({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'knowledge-bridge',
          version: '1.0.0',
        },
      },
    })
    log('Initialized MCP Knowledge Bridge Server')
    return
  }

  if (method === 'notifications/initialized') {
    log('Client confirmed initialization')
    return
  }

  if (method === 'tools/list') {
    sendMessage({
      jsonrpc: '2.0',
      id,
      result: { tools: TOOLS },
    })
    return
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params || {}
    const result = await handleToolCall(name, args || {})
    sendMessage({
      jsonrpc: '2.0',
      id,
      result,
    })
    return
  }

  if (method === 'ping') {
    sendMessage({
      jsonrpc: '2.0',
      id,
      result: {},
    })
    return
  }

  // Unknown method
  sendMessage({
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  })
}

process.stdin.on('end', () => {
  log('stdin closed, exiting')
  process.exit(0)
})

log('MCP Knowledge Bridge Server started (stdio transport)')
log(`Next.js API URL: ${NEXTJS_URL}`)
log(`Tools: ${TOOLS.map(t => t.name).join(', ')}`)
