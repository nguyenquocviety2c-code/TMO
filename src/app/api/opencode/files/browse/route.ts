import { NextResponse } from 'next/server'
import { readdir, stat, realpath } from 'fs/promises'
import { join, resolve, dirname, sep } from 'path'
import { existsSync } from 'fs'
import { homedir } from 'os'

export const dynamic = 'force-dynamic'

/**
 * GET /api/opencode/files/browse
 * Browse local filesystem for folder picker dialog
 * Query params:
 *   path: directory path to list (default: home directory)
 *   mode: 'folders' | 'all' (default: 'folders') — whether to show only folders or all entries
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const dirPath = searchParams.get('path') || homedir()
  const mode = searchParams.get('mode') || 'folders'

  const resolvedPath = resolve(dirPath)

  if (!existsSync(resolvedPath)) {
    return NextResponse.json({ error: 'Path not found', path: resolvedPath }, { status: 404 })
  }

  try {
    const stats = await stat(resolvedPath)
    if (!stats.isDirectory()) {
      return NextResponse.json({ error: 'Path is not a directory', path: resolvedPath }, { status: 400 })
    }

    // Security: resolve symlinks and verify it's still a real path
    const realPath = await realpath(resolvedPath)

    const entries = await readdir(realPath, { withFileTypes: true })
    const items: Array<{
      name: string
      path: string
      type: 'directory' | 'file'
      size?: number
      extension?: string
    }> = []

    // Sort: directories first, then files, alphabetically within each group
    const sorted = entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1
      if (!a.isDirectory() && b.isDirectory()) return 1
      return a.name.localeCompare(b.name)
    })

    for (const entry of sorted) {
      // In folders mode, only show directories
      if (mode === 'folders' && !entry.isDirectory()) continue

      // Skip hidden files/dirs (except .env for reference)
      if (entry.name.startsWith('.') && entry.name !== '.env') continue

      const fullPath = join(realPath, entry.name)

      if (entry.isDirectory()) {
        items.push({
          name: entry.name,
          path: fullPath,
          type: 'directory',
        })
      } else {
        try {
          const fileStats = await stat(fullPath)
          items.push({
            name: entry.name,
            path: fullPath,
            type: 'file',
            size: fileStats.size,
            extension: entry.name.includes('.') ? '.' + entry.name.split('.').pop() : undefined,
          })
        } catch { /* skip inaccessible files */ }
      }
    }

    // Build parent path info
    const parentDir = dirname(realPath)
    const home = homedir()
    const pathParts = realPath.split(sep).filter(Boolean)

    return NextResponse.json({
      currentPath: realPath,
      parentPath: parentDir !== realPath ? parentDir : null,
      homePath: home,
      isHome: realPath === home,
      pathParts,
      items,
      totalDirs: items.filter(i => i.type === 'directory').length,
      totalFiles: mode === 'all' ? items.filter(i => i.type === 'file').length : 0,
    })
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to browse directory',
      details: error instanceof Error ? error.message : 'Unknown error',
      path: resolvedPath,
    }, { status: 500 })
  }
}
