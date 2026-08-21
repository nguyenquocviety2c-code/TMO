import { NextResponse } from 'next/server'
import { getFileTree } from '@/lib/opencode'
import { readdir, stat, realpath } from 'fs/promises'
import { join, extname, resolve, sep } from 'path'
import { existsSync } from 'fs'

export const dynamic = 'force-dynamic'

/**
 * GET /api/opencode/files/tree
 * Get file tree from OpenCode server, fallback to local scan
 *
 * Query params:
 *   path: relative path within workspace OR absolute path (if starts with /)
 *   depth: recursion depth (default 3)
 *   root: override workspace root (absolute path for browsing custom directories)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const relPath = searchParams.get('path') || undefined
  const depth = parseInt(searchParams.get('depth') || '3')
  const customRoot = searchParams.get('root') || undefined

  // If custom root is specified, browse that directory directly (local filesystem mode)
  if (customRoot) {
    const rootPath = resolve(customRoot)

    if (!existsSync(rootPath)) {
      return NextResponse.json({ error: 'Path not found', tree: [], root: rootPath, source: 'local-fs' }, { status: 404 })
    }

    const stats = await stat(rootPath)
    if (!stats.isDirectory()) {
      return NextResponse.json({ error: 'Path is not a directory', root: rootPath, source: 'local-fs' }, { status: 400 })
    }

    const SKIP_DIRS = new Set([
      'node_modules', '.next', '.git', 'dist', 'build', '.cache',
      'qdrant-storage', '.openclaw-workspace', '.prisma', '__pycache__',
      '.venv', 'venv', '.tox', '.mypy_cache', '.pytest_cache',
    ])

    interface TreeNode {
      name: string
      path: string
      type: 'file' | 'directory'
      size?: number
      extension?: string
      children?: TreeNode[]
    }

    async function scanDir(dirPath: string, currentDepth: number): Promise<TreeNode[]> {
      if (currentDepth <= 0) return []
      try {
        const entries = await readdir(dirPath, { withFileTypes: true })
        const nodes: TreeNode[] = []

        const sorted = entries.sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1
          if (!a.isDirectory() && b.isDirectory()) return 1
          return a.name.localeCompare(b.name)
        })

        for (const entry of sorted) {
          if (SKIP_DIRS.has(entry.name)) continue
          if (entry.name.startsWith('.') && entry.name !== '.env') continue

          const fullPath = join(dirPath, entry.name)

          if (entry.isDirectory()) {
            nodes.push({
              name: entry.name,
              path: fullPath,
              type: 'directory',
              children: currentDepth > 1 ? await scanDir(fullPath, currentDepth - 1) : undefined,
            })
          } else {
            try {
              const stats = await stat(fullPath)
              nodes.push({
                name: entry.name,
                path: fullPath,
                type: 'file',
                size: stats.size,
                extension: extname(entry.name) || undefined,
              })
            } catch { /* skip */ }
          }
        }
        return nodes
      } catch {
        return []
      }
    }

    const tree = await scanDir(rootPath, depth)
    const realRoot = await realpath(rootPath)
    return NextResponse.json({ tree, root: realRoot, source: 'local-fs' })
  }

  // Original workspace mode — try OpenCode server first
  try {
    const tree = await getFileTree(relPath, depth)
    if (tree) {
      return NextResponse.json({ tree, source: 'opencode-server' })
    }
  } catch {
    // Server offline, fallback to local
  }

  // Fallback: scan workspace locally
  const WORKSPACE = resolve(process.cwd(), process.env.OPENCODE_WORKSPACE || '.')
  const rootPath = relPath ? join(WORKSPACE, relPath) : WORKSPACE

  if (!existsSync(rootPath)) {
    return NextResponse.json({ error: 'Path not found', tree: [], source: 'local-fallback' }, { status: 404 })
  }

  const SKIP_DIRS = new Set([
    'node_modules', '.next', '.git', 'dist', 'build', '.cache',
    'qdrant-storage', '.openclaw-workspace', '.prisma',
  ])

  interface TreeNode {
    name: string
    path: string
    type: 'file' | 'directory'
    size?: number
    extension?: string
    children?: TreeNode[]
  }

  async function scanDir(dirPath: string, currentDepth: number): Promise<TreeNode[]> {
    if (currentDepth <= 0) return []
    try {
      const entries = await readdir(dirPath, { withFileTypes: true })
      const nodes: TreeNode[] = []

      const sorted = entries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1
        if (!a.isDirectory() && b.isDirectory()) return 1
        return a.name.localeCompare(b.name)
      })

      for (const entry of sorted) {
        if (SKIP_DIRS.has(entry.name)) continue
        if (entry.name.startsWith('.') && entry.name !== '.env') continue

        const fullPath = join(dirPath, entry.name)
        const pathForClient = fullPath.replace(WORKSPACE + '/', '').replace(WORKSPACE, '')

        if (entry.isDirectory()) {
          nodes.push({
            name: entry.name,
            path: pathForClient,
            type: 'directory',
            children: currentDepth > 1 ? await scanDir(fullPath, currentDepth - 1) : undefined,
          })
        } else {
          try {
            const stats = await stat(fullPath)
            nodes.push({
              name: entry.name,
              path: pathForClient,
              type: 'file',
              size: stats.size,
              extension: extname(entry.name) || undefined,
            })
          } catch { /* skip */ }
        }
      }
      return nodes
    } catch {
      return []
    }
  }

  const tree = await scanDir(rootPath, depth)
  return NextResponse.json({ tree, source: 'local-fallback' })
}
