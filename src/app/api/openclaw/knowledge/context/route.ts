/**
 * Knowledge Context API — Returns context config and system prompt preview
 *
 * GET  /api/openclaw/knowledge/context — Get current context config + generated context
 * POST /api/openclaw/knowledge/context — Get system prompt preview
 */

import { NextResponse } from 'next/server'
import { getSchemaInfo } from '@/lib/knowledge-bridge'

export const dynamic = 'force-dynamic'

// Default context configuration
const DEFAULT_CONTEXT_CONFIG = {
  autoKBSearch: true,
  injectSchemaIntoSystemPrompt: true,
  knowledgeSources: 'Qdrant + Neo4j + SQLite',
  topK: 5,
  maxContextLength: '~4,000 tokens',
}

export async function GET() {
  try {
    // Also generate context string for preview
    const { generateSystemPromptContext } = await import('@/lib/knowledge-bridge')
    const context = await generateSystemPromptContext()

    return NextResponse.json({
      config: DEFAULT_CONTEXT_CONFIG,
      context,
      length: context.length,
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to generate context', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}

export async function POST() {
  try {
    const schema = await getSchemaInfo()

    // Generate the system prompt context preview
    const lines: string[] = []
    lines.push('=== KNOWLEDGE BASE CONTEXT ===')
    lines.push('')
    lines.push('## SQLite Models')
    for (const model of schema.prisma.models) {
      lines.push(`- ${model}`)
    }
    lines.push('')
    lines.push('## Neo4j Graph')
    if (schema.neo4j.labels.length > 0) {
      lines.push(`Node Labels: ${schema.neo4j.labels.join(', ')}`)
      lines.push(`Relationship Types: ${schema.neo4j.relationshipTypes.join(', ')}`)
      lines.push(`Total Nodes: ${schema.neo4j.nodeCount}`)
    } else {
      lines.push('Not connected or empty')
    }
    lines.push('')
    lines.push('## Qdrant Vector Store')
    for (const col of schema.qdrant.collections) {
      lines.push(`- ${col.name} (${col.vectorSize}-dim vectors)`)
    }
    lines.push('')
    lines.push('## Capabilities')
    lines.push('- Semantic search over document chunks (Qdrant)')
    lines.push('- Graph traversal and entity relationships (Neo4j)')
    lines.push('- Structured data queries (SQLite)')
    lines.push('- Auto knowledge search on each query')

    return NextResponse.json({
      preview: lines.join('\n'),
      tokenEstimate: Math.round(lines.join('\n').split(/\s+/).length * 1.3),
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate context preview' },
      { status: 500 }
    )
  }
}
