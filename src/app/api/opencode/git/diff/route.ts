/**
 * OC-3.6: Git Diff API
 * 
 * GET /api/opencode/git/diff?file=xxx&staged=true
 * Returns git diff for the workspace or a specific file
 */

import { NextRequest, NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { resolve } from 'path'

export async function GET(request: NextRequest) {
  try {
    const workspace = resolve(process.cwd(), process.env.OPENCODE_WORKSPACE || '.')
    const { searchParams } = new URL(request.url)
    const file = searchParams.get('file')
    const staged = searchParams.get('staged') === 'true'
    const commit = searchParams.get('commit')

    let diff = ''

    try {
      if (commit) {
        // Diff for a specific commit
        diff = execSync(`git show ${commit} --stat && git show ${commit}`, {
          cwd: workspace, encoding: 'utf-8', timeout: 10000, maxBuffer: 1024 * 1024
        })
      } else if (file) {
        // Diff for a specific file
        const cmd = staged 
          ? `git diff --cached -- "${file}"`
          : `git diff -- "${file}"`
        diff = execSync(cmd, {
          cwd: workspace, encoding: 'utf-8', timeout: 10000, maxBuffer: 1024 * 1024
        })
      } else {
        // Full diff
        const cmd = staged ? 'git diff --cached --stat && git diff --cached' : 'git diff --stat && git diff'
        diff = execSync(cmd, {
          cwd: workspace, encoding: 'utf-8', timeout: 10000, maxBuffer: 1024 * 1024
        })
      }
    } catch (error: unknown) {
      const err = error as { status?: number; stdout?: string; stderr?: string }
      // git diff returns exit code 1 for binary files or no changes
      if (err.stdout) {
        diff = err.stdout
      } else {
        diff = ''
      }
    }

    // Parse diff stats
    const lines = diff.split('\n')
    const additions = lines.filter(l => l.startsWith('+') && !l.startsWith('+++')).length
    const deletions = lines.filter(l => l.startsWith('-') && !l.startsWith('---')).length
    const filesChanged = lines.filter(l => l.startsWith('diff --git')).length

    return NextResponse.json({
      available: true,
      diff: diff.substring(0, 50000), // Cap at 50KB for response
      stats: {
        additions,
        deletions,
        filesChanged,
        totalLines: additions + deletions,
      },
      truncated: diff.length > 50000,
    })
  } catch (error) {
    return NextResponse.json({
      available: false,
      diff: '',
      stats: { additions: 0, deletions: 0, filesChanged: 0, totalLines: 0 },
      error: String(error),
    })
  }
}
