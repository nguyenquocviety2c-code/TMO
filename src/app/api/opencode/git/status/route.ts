/**
 * OC-3.6: Git Status API
 * 
 * GET /api/opencode/git/status
 * Returns current git status of the workspace
 */

import { NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { resolve } from 'path'

export async function GET() {
  try {
    const workspace = resolve(process.cwd(), process.env.OPENCODE_WORKSPACE || '.')
    
    // Get git status
    let statusOutput = ''
    let branch = ''
    let modified: string[] = []
    let staged: string[] = []
    let untracked: string[] = []
    let ahead = 0
    let behind = 0
    let lastCommit = ''

    try {
      statusOutput = execSync('git status --porcelain', { cwd: workspace, encoding: 'utf-8', timeout: 5000 })
      branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: workspace, encoding: 'utf-8', timeout: 5000 }).trim()
      lastCommit = execSync('git log -1 --oneline', { cwd: workspace, encoding: 'utf-8', timeout: 5000 }).trim()

      // Parse status
      const lines = statusOutput.split('\n').filter(Boolean)
      for (const line of lines) {
        const index = line.substring(0, 1)
        const workTree = line.substring(1, 2)
        const file = line.substring(3)

        if (index !== ' ' && index !== '?') {
          staged.push(file)
        }
        if (workTree !== ' ' || index === '?') {
          if (index === '?') {
            untracked.push(file)
          } else {
            modified.push(file)
          }
        }
      }

      // Get ahead/behind
      try {
        const tracking = execSync('git rev-parse --abbrev-ref @{upstream} 2>/dev/null', { 
          cwd: workspace, encoding: 'utf-8', timeout: 5000 
        }).trim()
        if (tracking) {
          const countOutput = execSync(`git rev-list --left-right --count ${tracking}...HEAD`, {
            cwd: workspace, encoding: 'utf-8', timeout: 5000
          }).trim()
          const [behindCount, aheadCount] = countOutput.split('\t').map(Number)
          ahead = aheadCount || 0
          behind = behindCount || 0
        }
      } catch {
        // No upstream
      }
    } catch {
      // Git not available or not a git repo
    }

    return NextResponse.json({
      available: true,
      branch,
      lastCommit,
      modified,
      staged,
      untracked,
      ahead,
      behind,
      totalChanges: modified.length + staged.length + untracked.length,
    })
  } catch (error) {
    return NextResponse.json({
      available: false,
      error: String(error),
      modified: [],
      staged: [],
      untracked: [],
      branch: '',
      lastCommit: '',
      ahead: 0,
      behind: 0,
      totalChanges: 0,
    })
  }
}
