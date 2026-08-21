/**
 * RepoMap — AST Symbol Tree Builder
 *
 * Walks the workspace file tree, parses TypeScript/JavaScript AST to extract
 * exported symbols (functions, classes, interfaces, components), and renders
 * a token-budgeted tree view for injection into agent prompts.
 *
 * Cache: .theopus/repomap.json in workspace root, invalidated by mtime changes.
 * In-memory cache with 60s TTL per workspaceId.
 */

import * as path from 'path'
import * as fs from 'fs/promises'
import { existsSync, statSync } from 'fs'
import type { FileSymbols, FileSymbol, RepoMapOptions, RepoMapCache } from './types'

// ==================== CONSTANTS ====================

const DEFAULT_MAX_FILES = 500
const DEFAULT_EXCLUDE_DIRS = [
  'node_modules', '.next', '.git', '.theopus', 'dist', 'build', '.turbo',
  '__pycache__', '.venv', 'venv', 'coverage', '.nyc_output',
]
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const CACHE_TTL_MS = 60_000 // 1 minute in-memory cache

// ==================== IN-MEMORY CACHE ====================

const cacheMap = new Map<string, RepoMapCache>()

// ==================== HELPERS ====================

/** Compute a hash from a list of strings (simple FNV-1a-like) */
function hashStrings(inputs: string[]): string {
  let h = 0x811c9dc5
  for (const s of inputs) {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
  }
  return (h >>> 0).toString(16)
}

/** Check if a directory should be excluded */
function isExcludedDir(name: string, extraExclude: string[]): boolean {
  return DEFAULT_EXCLUDE_DIRS.includes(name) || extraExclude.includes(name)
}

/** Check if a file is a source file we can parse */
function isSourceFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return SOURCE_EXTENSIONS.has(ext)
}

/** Detect if a variable declaration is a React component (PascalCase + likely JSX) */
function isReactComponent(name: string, initializerText: string): boolean {
  // PascalCase check
  if (!/^[A-Z][a-zA-Z0-9_]*$/.test(name)) return false
  // Arrow function returning JSX or React.createElement
  return /=>\s*[<(]/.test(initializerText) || /React\.createElement/.test(initializerText)
}

// ==================== AST PARSING (TypeScript Compiler API) ====================

/**
 * Parse a TypeScript/JavaScript file and extract exported symbols.
 * Uses the built-in TypeScript compiler API (no extra dependency).
 */
async function parseFileSymbols(filePath: string): Promise<FileSymbol[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const ts = await import('typescript')

    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true
    )

    const symbols: FileSymbol[] = []

    function visit(node: ts.Node) {
      // Only process top-level statements (not nested inside functions)
      if (node.parent === sourceFile || node.parent?.parent === sourceFile) {
        const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined
        const isExported = modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false

        if (ts.isFunctionDeclaration(node) && node.name) {
          symbols.push({ kind: 'function', name: node.name.text, line: ts.getLineAndCharacterOfPosition(sourceFile, node.getStart()).line + 1, exported: isExported })
        } else if (ts.isClassDeclaration(node) && node.name) {
          symbols.push({ kind: 'class', name: node.name.text, line: ts.getLineAndCharacterOfPosition(sourceFile, node.getStart()).line + 1, exported: isExported })
        } else if (ts.isInterfaceDeclaration(node) && node.name) {
          symbols.push({ kind: 'interface', name: node.name.text, line: ts.getLineAndCharacterOfPosition(sourceFile, node.getStart()).line + 1, exported: isExported })
        } else if (ts.isTypeAliasDeclaration(node) && node.name) {
          symbols.push({ kind: 'type', name: node.name.text, line: ts.getLineAndCharacterOfPosition(sourceFile, node.getStart()).line + 1, exported: isExported })
        } else if (ts.isEnumDeclaration(node) && node.name) {
          symbols.push({ kind: 'enum', name: node.name.text, line: ts.getLineAndCharacterOfPosition(sourceFile, node.getStart()).line + 1, exported: isExported })
        } else if (ts.isVariableStatement(node)) {
          for (const decl of node.declarationList.declarations) {
            if (ts.isIdentifier(decl.name) && decl.initializer) {
              const initText = content.slice(decl.initializer.getStart(), decl.initializer.getEnd())
              const kind: FileSymbol['kind'] = isReactComponent(decl.name.text, initText) ? 'component' : 'const'
              symbols.push({ kind, name: decl.name.text, line: ts.getLineAndCharacterOfPosition(sourceFile, decl.getStart()).line + 1, exported: isExported })
            }
          }
        }
      }
      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
    return symbols
  } catch {
    // If parsing fails (e.g., syntax errors), return empty — file still listed
    return []
  }
}

// ==================== FILE WALKING ====================

interface WalkEntry {
  relPath: string
  absPath: string
  size: number
  mtime: number
}

async function walkWorkspace(
  root: string,
  opts: RepoMapOptions
): Promise<WalkEntry[]> {
  const entries: WalkEntry[] = []
  const excludeDirs = [...DEFAULT_EXCLUDE_DIRS, ...(opts.exclude ?? [])]

  // Read .gitignore if exists for additional exclusions
  let gitignorePatterns: string[] = []
  try {
    const giContent = await fs.readFile(path.join(root, '.gitignore'), 'utf-8')
    gitignorePatterns = giContent
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'))
  } catch { /* no .gitignore */ }

  function matchesGitignore(relPath: string): boolean {
    for (const pat of gitignorePatterns) {
      if (pat.endsWith('/') && relPath.startsWith(pat)) return true
      if (!pat.includes('*') && relPath === pat) return true
      if (pat.includes('*')) {
        const regex = new RegExp('^' + pat.replace(/\*/g, '.*').replace(/\//g, '\\/') + '$')
        if (regex.test(relPath)) return true
      }
    }
    return false
  }

  async function walk(dir: string, relDir: string) {
    let dirents: fs.Dirent[]
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return // permission denied, skip
    }

    for (const d of dirents) {
      const relPath = relDir ? `${relDir}/${d.name}` : d.name
      const absPath = path.join(dir, d.name)

      if (d.isDirectory()) {
        if (isExcludedDir(d.name, excludeDirs)) continue
        if (matchesGitignore(relPath + '/')) continue
        await walk(absPath, relPath)
      } else if (d.isFile()) {
        if (matchesGitignore(relPath)) continue
        try {
          const stat = statSync(absPath)
          entries.push({ relPath, absPath, size: stat.size, mtime: stat.mtimeMs })
        } catch { /* skip unreadable */ }
      }
    }
  }

  await walk(root, '')
  return entries
}

// ==================== CORE FUNCTIONS ====================

/**
 * Build a repo map: walk file tree, parse AST for source files,
 * extract symbols, cache result.
 */
export async function buildRepoMap(
  root: string,
  opts: RepoMapOptions = {}
): Promise<FileSymbols[]> {
  const maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES

  // 1. Walk tree
  let entries = await walkWorkspace(root, opts)

  // 2. Limit files: prioritize source files
  if (entries.length > maxFiles) {
    const sourceFiles = entries.filter(e => isSourceFile(e.relPath))
    const otherFiles = entries.filter(e => !isSourceFile(e.relPath))
    // Take all source files first, then fill remaining with other files
    const remaining = maxFiles - sourceFiles.length
    entries = [...sourceFiles.slice(0, maxFiles), ...otherFiles.slice(0, Math.max(0, remaining))]
      .slice(0, maxFiles)
  }

  // 3. Compute cache key
  const cacheInputs = entries.map(e => `${e.relPath}:${e.mtime}`).sort()
  const keyHash = hashStrings(cacheInputs)

  // 4. Check in-memory cache
  const cached = cacheMap.get(root)
  if (cached && cached.keyHash === keyHash && (Date.now() - cached.createdAt) < CACHE_TTL_MS) {
    return cached.map
  }

  // 5. Check file cache (.theopus/repomap.json)
  const cacheDir = path.join(root, '.theopus')
  const cacheFile = path.join(cacheDir, 'repomap.json')
  try {
    if (existsSync(cacheFile)) {
      const raw = await fs.readFile(cacheFile, 'utf-8')
      const diskCache = JSON.parse(raw) as { keyHash: string; map: FileSymbols[]; createdAt: number }
      if (diskCache.keyHash === keyHash) {
        // Valid disk cache
        cacheMap.set(root, { map: diskCache.map, keyHash, createdAt: Date.now() })
        return diskCache.map
      }
    }
  } catch { /* cache miss, rebuild */ }

  // 6. Build: parse source files, list others
  const result: FileSymbols[] = []
  for (const entry of entries) {
    if (isSourceFile(entry.relPath)) {
      const symbols = await parseFileSymbols(entry.absPath)
      result.push({
        path: entry.relPath,
        size: entry.size,
        symbols,
        mtime: entry.mtime,
      })
    } else {
      result.push({
        path: entry.relPath,
        size: entry.size,
        symbols: [],
        mtime: entry.mtime,
      })
    }
  }

  // 7. Save caches
  cacheMap.set(root, { map: result, keyHash, createdAt: Date.now() })
  try {
    await fs.mkdir(cacheDir, { recursive: true })
    await fs.writeFile(cacheFile, JSON.stringify({ keyHash, map: result, createdAt: Date.now() }), 'utf-8')
  } catch { /* non-critical: cache write failure */ }

  return result
}

// ==================== RENDERING ====================

interface RankedFile {
  file: FileSymbols
  score: number
}

/**
 * Render repo map as a token-budgeted tree view for agent prompts.
 *
 * Ranking:
 *   +10 per keyword match in path/symbol (from userRequest)
 *   +5 per exported symbol
 *   +2 per symbol total
 */
export function renderRepoMap(
  map: FileSymbols[],
  tokenBudget: number,
  userRequest?: string
): string {
  const keywords = userRequest
    ? userRequest.toLowerCase().split(/[\s,;.]+/).filter(k => k.length > 2)
    : []

  // Rank files
  const ranked: RankedFile[] = map.map(file => {
    let score = 0
    // Keyword matches
    for (const kw of keywords) {
      if (file.path.toLowerCase().includes(kw)) score += 10
      for (const sym of file.symbols) {
        if (sym.name.toLowerCase().includes(kw)) score += 10
      }
    }
    // Symbol bonuses
    score += file.symbols.filter(s => s.exported).length * 5
    score += file.symbols.length * 2
    return { file, score }
  })

  ranked.sort((a, b) => b.score - a.score)

  // Build directory tree structure
  const dirMap = new Map<string, RankedFile[]>()
  for (const r of ranked) {
    const dir = path.dirname(r.file.path)
    if (!dirMap.has(dir)) dirMap.set(dir, [])
    dirMap.get(dir)!.push(r)
  }

  // Estimate chars: ~4 chars per token
  const maxChars = tokenBudget * 4
  let output = ''
  let charCount = 0

  // Sort directories alphabetically
  const sortedDirs = [...dirMap.keys()].sort()

  for (const dir of sortedDirs) {
    const files = dirMap.get(dir)!
    const dirHeader = `${dir}/\n`
    if (charCount + dirHeader.length > maxChars) break
    output += dirHeader
    charCount += dirHeader.length

    for (const { file } of files) {
      let line: string
      if (file.symbols.length > 0) {
        const symStr = file.symbols
          .map(s => `${s.kind === 'component' ? 'C' : s.kind === 'function' ? 'F' : s.kind === 'class' ? 'C' : s.kind === 'interface' ? 'I' : s.kind === 'type' ? 'T' : s.kind === 'enum' ? 'E' : 'V'}: ${s.name}`)
          .join(', ')
        line = `  ${path.basename(file.path)} [${symStr}]\n`
      } else {
        line = `  ${path.basename(file.path)} (${file.size}B)\n`
      }

      if (charCount + line.length > maxChars) {
        output += `  ... [${files.length - files.indexOf(file)} more files truncated — token budget reached]\n`
        return output
      }
      output += line
      charCount += line.length
    }
  }

  return output || '(empty workspace)'
}

// ==================== TOOL: repo_map ====================

/**
 * Tool implementation: build and render repo map for agent consumption.
 * Called by tool-executor when agent invokes `repo_map` tool.
 */
export async function executeRepoMapTool(
  root: string,
  userRequest?: string
): Promise<string> {
  const map = await buildRepoMap(root)
  return renderRepoMap(map, 2000, userRequest)
}