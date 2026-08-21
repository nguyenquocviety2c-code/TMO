/**
 * Git Manager — Git operations for Code Team workflow
 *
 * Phase 2: Provides git status, diff, log, stash, branch, checkout operations.
 * Used by BOLT (G2-A) to manage code changes during implementation,
 * and by SENTINEL (G2-B) to review diffs before verification.
 *
 * Security: Only read-only + safe operations. No push, no force, no destructive.
 *
 * Operations:
 *   - status: Show working tree status
 *   - diff: Show changes (unstaged, staged, or specific file)
 *   - log: Show commit history
 *   - stash: Save/restore working changes
 *   - branch: List/create branches
 *   - checkout: Switch branches (safe — checks for conflicts first)
 */

import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// ==================== CONSTANTS ====================

const GIT_TIMEOUT = 15000 // 15s timeout for git commands
const MAX_OUTPUT = 50000 // Max chars in output

// ==================== TYPES ====================

export interface GitResult {
  success: boolean
  output: string
  error?: string
}

export interface GitStatusResult extends GitResult {
  files: GitFileStatus[]
  branch: string
  ahead: number
  behind: number
}

export interface GitFileStatus {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflict'
  staged: boolean
  oldPath?: string // For renamed files
}

export interface GitDiffResult extends GitResult {
  files: string[]
  additions: number
  deletions: number
}

export interface GitLogResult extends GitResult {
  commits: GitCommit[]
}

export interface GitCommit {
  hash: string
  author: string
  date: string
  message: string
}

// ==================== HELPERS ====================

function truncateOutput(output: string): string {
  if (output.length > MAX_OUTPUT) {
    return output.slice(0, MAX_OUTPUT) + '\n\n... [TRUNCATED]'
  }
  return output
}

async function runGit(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
  const cmd = `git ${args.join(' ')}`
  const { stdout, stderr } = await execAsync(cmd, {
    cwd: cwd || process.cwd(),
    timeout: GIT_TIMEOUT,
    maxBuffer: 1024 * 1024, // 1MB
  })
  return { stdout: stdout.trim(), stderr: stderr.trim() }
}

// ==================== OPERATIONS ====================

/**
 * Get git status — working tree state, branch info, file changes.
 */
export async function gitStatus(): Promise<GitStatusResult> {
  try {
    // Get branch info
    const { stdout: branchOut } = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'])
    const branch = branchOut.trim()

    // Get ahead/behind counts
    let ahead = 0
    let behind = 0
    try {
      const { stdout: remoteOut } = await runGit(['rev-list', '--left-right', '--count', `origin/${branch}...HEAD`])
      const parts = remoteOut.split('\t')
      ahead = parseInt(parts[1] || '0', 10) || 0
      behind = parseInt(parts[0] || '0', 10) || 0
    } catch {
      // No remote tracking — OK
    }

    // Get file status (porcelain format for parsing)
    const { stdout: statusOut } = await runGit(['status', '--porcelain'])
    const files = parsePorcelainStatus(statusOut)

    return {
      success: true,
      output: statusOut || '(clean working tree)',
      files,
      branch,
      ahead,
      behind,
    }
  } catch (err) {
    return {
      success: false,
      output: '',
      error: `Git status failed: ${err instanceof Error ? err.message : String(err)}`,
      files: [],
      branch: 'unknown',
      ahead: 0,
      behind: 0,
    }
  }
}

/** Parse git status --porcelain output into structured file list */
function parsePorcelainStatus(output: string): GitFileStatus[] {
  if (!output.trim()) return []

  const files: GitFileStatus[] = []
  for (const line of output.split('\n')) {
    if (line.length < 3) continue

    const xy = line.slice(0, 2)
    const path = line.slice(3).trim()

    // Handle renamed files (R  old -> new)
    if (xy.startsWith('R')) {
      const parts = path.split(' -> ')
      files.push({
        path: parts[1] || path,
        status: 'renamed',
        staged: xy[0] !== ' ',
        oldPath: parts[0],
      })
      continue
    }

    const statusMap: Record<string, GitFileStatus['status']> = {
      'M': 'modified',
      'A': 'added',
      'D': 'deleted',
      '?': 'untracked',
      'U': 'conflict',
    }

    const statusCode = xy[1] !== ' ' ? xy[1] : xy[0]
    const status = statusMap[statusCode] || 'modified'

    files.push({
      path,
      status,
      staged: xy[0] !== ' ' && xy[0] !== '?',
    })
  }

  return files
}

/**
 * Get git diff — show changes in working tree.
 *
 * @param staged - If true, show staged changes (--cached). Default: unstaged.
 * @param filePath - Optional specific file to diff
 */
export async function gitDiff(
  staged: boolean = false,
  filePath?: string
): Promise<GitDiffResult> {
  try {
    const args = ['diff']
    if (staged) args.push('--cached')
    if (filePath) args.push('--', filePath)

    const { stdout } = await runGit(args)
    const { stdout: statOut } = await runGit([...args, '--stat'])

    // Parse --stat for file list + counts
    const files: string[] = []
    let additions = 0
    let deletions = 0

    for (const line of statOut.split('\n')) {
      const match = line.match(/^\s*(.+?)\s*\|\s*(\d+)\s*([+-]+)/)
      if (match) {
        files.push(match[1].trim())
        const changes = match[3]
        additions += (changes.match(/\+/g) || []).length
        deletions += (changes.match(/-/g) || []).length
      }
    }

    return {
      success: true,
      output: truncateOutput(stdout || '(no changes)'),
      files,
      additions,
      deletions,
    }
  } catch (err) {
    return {
      success: false,
      output: '',
      error: `Git diff failed: ${err instanceof Error ? err.message : String(err)}`,
      files: [],
      additions: 0,
      deletions: 0,
    }
  }
}

/**
 * Get git log — commit history.
 *
 * @param count - Number of recent commits (default: 10, max: 50)
 * @param filePath - Optional specific file history
 */
export async function gitLog(
  count: number = 10,
  filePath?: string
): Promise<GitLogResult> {
  const limit = Math.min(count, 50)

  try {
    const args = [
      'log',
      `-${limit}`,
      '--format=%H|%an|%ai|%s',
    ]
    if (filePath) args.push('--', filePath)

    const { stdout } = await runGit(args)
    const commits = parseGitLog(stdout)

    return {
      success: true,
      output: stdout || '(no commits)',
      commits,
    }
  } catch (err) {
    return {
      success: false,
      output: '',
      error: `Git log failed: ${err instanceof Error ? err.message : String(err)}`,
      commits: [],
    }
  }
}

/** Parse git log custom format into structured commits */
function parseGitLog(output: string): GitCommit[] {
  if (!output.trim()) return []

  return output.split('\n').map(line => {
    const [hash, author, date, ...messageParts] = line.split('|')
    return {
      hash: hash?.slice(0, 8) || '',
      author: author || '',
      date: date || '',
      message: messageParts.join('|') || '',
    }
  })
}

/**
 * Git stash — save or restore working changes.
 *
 * @param action - 'save' (stash changes), 'pop' (restore latest), 'list' (show stashes)
 * @param message - Optional stash message (for 'save')
 */
export async function gitStash(
  action: 'save' | 'pop' | 'list',
  message?: string
): Promise<GitResult> {
  try {
    let args: string[]

    switch (action) {
      case 'save':
        args = ['stash', 'push']
        if (message) args.push('-m', message)
        break
      case 'pop':
        args = ['stash', 'pop']
        break
      case 'list':
        args = ['stash', 'list']
        break
    }

    const { stdout, stderr } = await runGit(args)
    return {
      success: true,
      output: truncateOutput(stdout || stderr || `Stash ${action} completed`),
    }
  } catch (err) {
    return {
      success: false,
      output: '',
      error: `Git stash ${action} failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/**
 * Git branch — list or create branches.
 *
 * @param action - 'list' (show branches), 'create' (create new branch)
 * @param branchName - Branch name (for 'create')
 */
export async function gitBranch(
  action: 'list' | 'create',
  branchName?: string
): Promise<GitResult & { branches?: string[] }> {
  try {
    if (action === 'list') {
      const { stdout } = await runGit(['branch', '--list'])
      const branches = stdout.split('\n')
        .map(b => b.replace(/^\*?\s+/, '').trim())
        .filter(Boolean)

      return {
        success: true,
        output: stdout,
        branches,
      }
    }

    if (action === 'create' && branchName) {
      // Validate branch name — no special chars
      if (!/^[a-zA-Z0-9._/-]+$/.test(branchName)) {
        return { success: false, output: '', error: `Invalid branch name: "${branchName}"` }
      }

      const { stdout, stderr } = await runGit(['checkout', '-b', branchName])
      return {
        success: true,
        output: stdout || stderr || `Branch "${branchName}" created and checked out`,
      }
    }

    return { success: false, output: '', error: 'Branch name required for create action' }
  } catch (err) {
    return {
      success: false,
      output: '',
      error: `Git branch ${action} failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/**
 * Git checkout — switch branches (safe — checks for uncommitted changes first).
 *
 * @param branchName - Branch to switch to
 */
export async function gitCheckout(branchName: string): Promise<GitResult> {
  if (!branchName) return { success: false, output: '', error: 'Branch name required' }

  // Validate branch name
  if (!/^[a-zA-Z0-9._/-]+$/.test(branchName)) {
    return { success: false, output: '', error: `Invalid branch name: "${branchName}"` }
  }

  try {
    // Safety check: warn if there are uncommitted changes
    const { stdout: statusOut } = await runGit(['status', '--porcelain'])
    const hasChanges = statusOut.trim().length > 0

    const { stdout, stderr } = await runGit(['checkout', branchName])

    let output = stdout || stderr || `Switched to branch "${branchName}"`
    if (hasChanges) {
      output += '\n⚠️ Warning: You had uncommitted changes before checkout. They may have been carried over or caused conflicts.'
    }

    return {
      success: true,
      output: truncateOutput(output),
    }
  } catch (err) {
    return {
      success: false,
      output: '',
      error: `Git checkout "${branchName}" failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

// ==================== TOOL EXECUTORS ====================

/**
 * Execute git_status tool from LLM function calling.
 */
export async function executeGitStatusTool(): Promise<GitStatusResult> {
  return gitStatus()
}

/**
 * Execute git_diff tool from LLM function calling.
 */
export async function executeGitDiffTool(
  staged?: boolean,
  filePath?: string
): Promise<GitDiffResult> {
  return gitDiff(staged, filePath)
}

/**
 * Execute git_log tool from LLM function calling.
 */
export async function executeGitLogTool(
  count?: number,
  filePath?: string
): Promise<GitLogResult> {
  return gitLog(count, filePath)
}

/**
 * Execute git_stash tool from LLM function calling.
 */
export async function executeGitStashTool(
  action: 'save' | 'pop' | 'list',
  message?: string
): Promise<GitResult> {
  return gitStash(action, message)
}

/**
 * Execute git_branch tool from LLM function calling.
 */
export async function executeGitBranchTool(
  action: 'list' | 'create',
  branchName?: string
): Promise<GitResult & { branches?: string[] }> {
  return gitBranch(action, branchName)
}

/**
 * Execute git_checkout tool from LLM function calling.
 */
export async function executeGitCheckoutTool(
  branchName: string
): Promise<GitResult> {
  return gitCheckout(branchName)
}