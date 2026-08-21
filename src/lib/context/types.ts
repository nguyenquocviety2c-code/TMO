/**
 * Context Module — Shared Types
 *
 * Used by RepoMap, CodeIndexer, and context injection into agent prompts.
 */

/** Symbol extracted from a source file via AST parsing */
export interface FileSymbol {
  kind: 'function' | 'class' | 'interface' | 'type' | 'const' | 'enum' | 'component'
  name: string
  line: number
  /** Whether this symbol is exported */
  exported: boolean
}

/** Per-file symbol summary */
export interface FileSymbols {
  path: string
  /** Relative to workspace root */
  size: number
  symbols: FileSymbol[]
  /** mtime for cache invalidation */
  mtime: number
}

/** Options for building repo map */
export interface RepoMapOptions {
  /** Max files to include (default 500) */
  maxFiles?: number
  /** Glob patterns to include (overrides default .ts/.tsx/.js/.jsx) */
  include?: string[]
  /** Glob patterns to exclude (adds to default exclusions) */
  exclude?: string[]
}

/** A code chunk for embedding index */
export interface CodeChunk {
  /** Unique id = hash(workspaceId + filePath + startLine) */
  id: string
  workspaceId: string
  filePath: string
  startLine: number
  endLine: number
  symbolName?: string
  language: string
  content: string
  mtime: number
}

/** Search result from code index */
export interface CodeSearchResult {
  filePath: string
  startLine: number
  endLine: number
  symbolName?: string
  score: number
  snippet: string
}

/** Repo map cache entry */
export interface RepoMapCache {
  map: FileSymbols[]
  keyHash: string
  createdAt: number
}