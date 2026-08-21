/**
 * Code Indexer — Embedding-based semantic code search
 *
 * Phase 2: Chunks source files, generates embeddings via NVIDIA/OpenRouter,
 * indexes into Qdrant collection "code_chunks", and provides semantic search.
 *
 * Flow:
 *   1. indexFiles(paths[]) → chunk each file → embed → upsert to Qdrant
 *   2. searchCode(query) → embed query → search Qdrant → return ranked chunks
 *
 * Chunking strategy: Split by function/class boundaries (heuristic),
 * fallback to fixed-size sliding window (200 lines, 50 overlap).
 */

import { generateEmbedding } from '@/lib/embeddings'
import { getQdrantClient } from '@/lib/qdrant'
import type { CodeChunk, CodeSearchResult } from './types'

// ==================== CONSTANTS ====================

const COLLECTION_CODE_CHUNKS = 'code_chunks'
const VECTOR_SIZE = 2048
const DEFAULT_TOP_K = 10
const CHUNK_LINES = 200
const CHUNK_OVERLAP = 50

// ==================== CHUNKING ====================

/**
 * Split source code into semantic chunks.
 * Strategy: Split on function/class/interface boundaries first,
 * then fall back to fixed-size sliding window.
 */
function chunkCode(filePath: string, content: string): CodeChunk[] {
  const lines = content.split('\n')
  const chunks: CodeChunk[] = []

  // Detect boundaries: lines starting with export, function, class, interface
  const boundaryPattern = /^\s*(export\s+)?(async\s+)?function\s|^\s*(export\s+)?(abstract\s+)?class\s|^\s*(export\s+)?interface\s|^\s*(export\s+)?type\s+\w+\s*=|^\s*(export\s+)?const\s+\w+\s*=\s*(async\s+)?\(/
  const boundaries: number[] = [0]

  for (let i = 0; i < lines.length; i++) {
    if (boundaryPattern.test(lines[i])) {
      boundaries.push(i)
    }
  }
  boundaries.push(lines.length)

  // Create chunks from boundaries, merging small ones
  let chunkStart = 0
  for (let i = 1; i < boundaries.length; i++) {
    const end = boundaries[i]
    const size = end - chunkStart

    if (size >= 10 || i === boundaries.length - 1) {
      // Big enough or last chunk — emit
      const chunkLines = lines.slice(chunkStart, end)
      chunks.push({
        filePath,
        content: chunkLines.join('\n'),
        startLine: chunkStart + 1,
        endLine: end,
        summary: extractSummary(chunkLines),
      })
      chunkStart = end
    }
    // else: too small, merge with next boundary
  }

  // If no boundaries found (e.g., JSON, CSS), use sliding window
  if (chunks.length === 0) {
    for (let i = 0; i < lines.length; i += CHUNK_LINES - CHUNK_OVERLAP) {
      const end = Math.min(i + CHUNK_LINES, lines.length)
      const chunkLines = lines.slice(i, end)
      chunks.push({
        filePath,
        content: chunkLines.join('\n'),
        startLine: i + 1,
        endLine: end,
        summary: `${filePath} lines ${i + 1}-${end}`,
      })
    }
  }

  return chunks
}

/** Extract a short summary from the first few lines of a chunk */
function extractSummary(lines: string[]): string {
  // Find first non-empty, non-comment, non-import line
  for (const line of lines.slice(0, 10)) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.startsWith('*') && !trimmed.startsWith('import ')) {
      return trimmed.slice(0, 120)
    }
  }
  return lines[0]?.trim().slice(0, 120) || '(empty)'
}

// ==================== INDEXING ====================

/**
 * Index source files into Qdrant code_chunks collection.
 * Creates collection if not exists, chunks files, generates embeddings, upserts.
 *
 * @param filePaths - Array of absolute file paths to index
 * @returns Number of chunks indexed
 */
export async function indexFiles(filePaths: string[]): Promise<{ indexed: number; errors: string[] }> {
  const qdrant = getQdrantClient()
  const errors: string[] = []
  let indexed = 0

  // Ensure collection exists
  try {
    await qdrant.createCollection(COLLECTION_CODE_CHUNKS, {
      vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
    })
  } catch {
    // Collection already exists — OK
  }

  // Read + chunk all files
  const fs = await import('fs/promises')
  const allChunks: CodeChunk[] = []

  for (const filePath of filePaths) {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const chunks = chunkCode(filePath, content)
      allChunks.push(...chunks)
    } catch (err) {
      errors.push(`${filePath}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Generate embeddings + upsert in batches
  const BATCH_SIZE = 20
  for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
    const batch = allChunks.slice(i, i + BATCH_SIZE)

    try {
      // Generate embeddings for batch (parallel)
      const embeddings = await Promise.all(
        batch.map(chunk =>
          generateEmbedding(chunk.content, { inputType: 'passage' }).catch(() => null)
        )
      )

      // Build points (skip failed embeddings)
      const points: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }> = []
      for (let j = 0; j < batch.length; j++) {
        const emb = embeddings[j]
        if (!emb) continue

        const chunk = batch[j]
        const pointId = `${Buffer.from(chunk.filePath).toString('base64').slice(0, 40)}_L${chunk.startLine}`

        points.push({
          id: pointId,
          vector: emb.vector,
          payload: {
            filePath: chunk.filePath,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            summary: chunk.summary,
            content: chunk.content.slice(0, 8000), // Truncate for Qdrant payload limit
          },
        })
      }

      if (points.length > 0) {
        await qdrant.upsert(COLLECTION_CODE_CHUNKS, { points })
        indexed += points.length
      }
    } catch (err) {
      errors.push(`Batch ${i}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { indexed, errors }
}

// ==================== SEARCH ====================

/**
 * Semantic code search — embed query, search Qdrant, return ranked chunks.
 *
 * @param query - Natural language query (e.g., "authentication middleware")
 * @param topK - Number of results (default 10)
 * @returns Ranked search results with file path, line range, content, and score
 */
export async function searchCode(
  query: string,
  topK: number = DEFAULT_TOP_K
): Promise<CodeSearchResult[]> {
  const qdrant = getQdrantClient()

  // Generate query embedding
  let queryVector: number[]
  try {
    const emb = await generateEmbedding(query, { inputType: 'query' })
    queryVector = emb.vector
  } catch {
    // Fallback: pseudo-hash vector (won't match well but won't crash)
    const { createHash } = await import('crypto')
    const hash = createHash('sha256').update(query).digest()
    queryVector = Array.from({ length: VECTOR_SIZE }, (_, i) => (hash[i % hash.length] || 0) / 255)
  }

  // Search Qdrant
  let results: CodeSearchResult[] = []
  try {
    const searchResult = await qdrant.search(COLLECTION_CODE_CHUNKS, {
      vector: queryVector,
      limit: topK,
      with_payload: true,
    })

    results = (searchResult || []).map((r: { payload?: Record<string, unknown>; score?: number }) => ({
      filePath: (r.payload?.filePath as string) || '',
      startLine: (r.payload?.startLine as number) || 1,
      endLine: (r.payload?.endLine as number) || 1,
      content: (r.payload?.content as string) || '',
      summary: (r.payload?.summary as string) || '',
      score: r.score || 0,
    }))
  } catch {
    // Qdrant unavailable — return empty gracefully
    console.warn('[CodeIndexer] Qdrant search failed — returning empty results')
  }

  return results
}

// ==================== TOOL EXECUTOR ====================

/**
 * Execute code_search tool from LLM function calling.
 * Called by tool-executor.ts switch case.
 */
export async function executeCodeSearchTool(
  query: string,
  topK?: number
): Promise<{ results: CodeSearchResult[]; query: string }> {
  const results = await searchCode(query, topK)
  return { query, results }
}

/**
 * Execute code_index tool from LLM function calling.
 * Indexes specified files into Qdrant for later semantic search.
 */
export async function executeCodeIndexTool(
  filePaths: string[]
): Promise<{ indexed: number; errors: string[] }> {
  const fs = await import('fs/promises')
  const path = await import('path')

  // Resolve relative paths to absolute
  const cwd = process.cwd()
  const absolutePaths = filePaths.map(fp => path.resolve(cwd, fp))

  // Verify files exist
  const validPaths: string[] = []
  const errors: string[] = []
  for (const fp of absolutePaths) {
    try {
      await fs.access(fp)
      validPaths.push(fp)
    } catch {
      errors.push(`File not found: ${fp}`)
    }
  }

  if (validPaths.length === 0) {
    return { indexed: 0, errors }
  }

  const result = await indexFiles(validPaths)
  return {
    indexed: result.indexed,
    errors: [...errors, ...result.errors],
  }
}