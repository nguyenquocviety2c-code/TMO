/**
 * Command Validation Module v2
 *
 * Risk-tier based command validation thay vì hard-block whitelist.
 * Cross-platform aware (Windows PowerShell / Unix bash).
 *
 * 3 tiers:
 *   LOW    — auto-run (echo, cat, ls, pwd, which, head, tail, wc)
 *   MEDIUM — auto-run + log (npm/bun run/test/install, tsc, eslint, git status/diff/log, curl read-only)
 *   HIGH   — require approval (git add/commit/push, npm install -g, docker exec,
 *            prisma migrate/push, rm, mv, mkdir, write operations)
 *
 * @module CommandValidator v2
 */

import * as path from 'node:path'

// ==================== RISK TIERS ====================

export type RiskTier = 'LOW' | 'MEDIUM' | 'HIGH'

// ==================== PATTERNS ====================

/** LOW risk: read-only, no side effects */
const LOW_PATTERNS: RegExp[] = [
  /^echo\b/i,
  /^cat\b/i,
  /^head\b/i,
  /^tail\b/i,
  /^ls\b/i,
  /^dir\b/i,       // Windows
  /^pwd\b/i,
  /^cd\b/i,
  /^which\b/i,
  /^where\b/i,      // Windows
  /^wc\b/i,
  /^type\b/i,       // Windows cat
  /^find\b/i,
  /^findstr\b/i,    // Windows grep
  /^rg\b/i,
  /^grep\b/i,
  /^sort\b/i,
  /^uniq\b/i,
  /^awk\b/i,
  /^sed\b/i,
  /^node\s+-p\b/i,
  /^node\s+--print\b/i,
  /^python(3)?\s+-c\b/i,
  /^printenv\b/i,
  /^env\b/i,
  /^date\b/i,
]

/** MEDIUM risk: read + tooling, no destructive mutations */
const MEDIUM_PATTERNS: RegExp[] = [
  // Package managers (install/add require network, but safe in workspace)
  /^npm\s+(run|test|lint|check|ci|audit|outdated|why|view|info)\b/i,
  /^npm\s+(install|i|add)\b.*(--save-dev|-D)?\s+\S/i, // install within project
  /^bun\s+(run|test|lint|check|outdated)\b/i,
  /^bun\s+(install|add|i)\b/i,
  /^pnpm\s+(run|test|lint|check)\b/i,
  /^pnpm\s+(install|add)\b/i,
  /^yarn\s+(run|test|lint|check|audit)\b/i,
  /^bunx\s+/i,
  /^npx\s+/i,
  // Build/type check
  /^tsc\b/i,
  /^eslint\b/i,
  /^prettier\b/i,
  /^prisma\s+(generate|validate|format|studio)\b/i,
  // Git read-only
  /^git\s+(status|diff|log|show|branch|tag|remote|stash\s+list|config\s+--get)\b/i,
  // Curl read-only
  /^curl\s+(-s\s+|--silent\s+)?(-I\s+|--head\s+)?(GET\s+)?https?/i,
  /^curl\s+(-s\s+|--silent\s+)?(-X\s+GET\s+|--request\s+GET\s+)?https?/i,
  // Docker info
  /^docker\s+(ps|images|info|version|stats|logs|inspect)\b/i,
  // Network diagnostics
  /^ping\b/i,
  /^nslookup\b/i,
  /^tracert\b/i,
  /^traceroute\b/i,
  // Process list (read only)
  /^ps\b/i,
  /^tasklist\b/i,   // Windows
  /^top\b/i,
  /^htop\b/i,
]

/** HIGH risk: destructive, mutation, network write, system-level */
const HIGH_PATTERNS: RegExp[] = [
  // Package managers global / unlink
  /^npm\s+(install|i|add)\s+-g\b/i,
  /^npm\s+(uninstall|rm|remove|unlink|un)\b/i,
  /^bun\s+(remove|rm|unlink)\b/i,
  /^pnpm\s+(uninstall|remove)\b/i,
  /^yarn\s+(remove|unlink)\b/i,
  // Git write
  /^git\s+(add|commit|push|pull|merge|rebase|reset|cherry-pick|stash\b(?!\s+list)|stash\s+(push|apply|drop|pop))\b/i,
  /^git\s+(checkout|switch)\b/i,
  /^git\s+(rm|mv)\b/i,
  /^git\s+(tag\s+-|tag\s+\S)/i,
  // Prisma destructive
  /^prisma\s+(migrate|db\s+push|db\s+reset|db\s+seed)\b/i,
  // Docker write
  /^docker\s+(exec|run|start|stop|restart|kill|rm|rmi|build|push|pull|compose)\b/i,
  // File write/delete
  /^rm\b/i,
  /^del\b/i,        // Windows
  /^rmdir\b/i,
  /^mv\b/i,
  /^move\b/i,       // Windows
  /^(cp|copy|xcopy|robocopy)\b/i,
  /^mkdir\b/i,
  /^touch\b/i,
  /^tee\b/i,
  /^(scp|rsync)\b/i,
  /^(chmod|chown|chgrp)\b/i,
  /^(ln|symlink|mklink)\b/i,
  // Process kill
  /^(kill|killall|pkill|taskkill)\b/i,
  // System-level
  /^(sudo|su|runas)\b/i,
  /^(shutdown|reboot|restart-computer)\b/i,
  /^(systemctl|service)\b/i,
  /^registry\b/i,
  /^netsh\b/i,
  /^net\s+(start|stop)\b/i,
  // Network write
  /^curl\s+.*(-X\s+(POST|PUT|PATCH|DELETE)|--request\s+(POST|PUT|PATCH|DELETE))\b/i,
  /^curl\s+.*-d\b/i,
  /^wget\b/i,
  // Script exec (unknown content)
  /^(\.\/|bash\s+|sh\s+|powershell\s+-File|pwsh\s+-File)/i,
  // Format/truncate
  /^(format|mkfs|dd|fsutil)\b/i,
]

// ==================== METACHARACTER BLOCKS ====================

/**
 * Shell metacharacters that indicate command injection.
 * Always blocked regardless of risk tier.
 */
const BLOCKED_METACHARS = /[;|&`$><\n\r]/g

/**
 * Command injection patterns — always blocked.
 */
const INJECTION_PATTERNS = [
  /\$\(/,      // $()
  /\$\{/,      // ${}
  /&&/,        // &&
  /\|\|/,      // ||
  /`[^`]+`/,   // backtick subcommand
  /;/,         // ;
  /\|/,        // pipe
  /&(?!\s)/,   // background (but allow & as arg)
]

// ==================== ASSESS COMMAND (v2 tokenize) ====================

/**
 * Tokenize a command by shell separators (&&, ||, ;, |) into sub-commands.
 * Each sub-command is assessed individually; the highest tier wins.
 * Metacharacters are ALLOWED (cwd is locked in workspace, so safe).
 */
const COMMAND_SEPARATOR = /\s*(&&|\|\||;|\|)\s*/

export type AssessTier = 'safe' | 'caution' | 'dangerous'

export interface AssessResult {
  tier: AssessTier
  subCommands: Array<{ command: string; tier: AssessTier; matchedPattern?: string }>
  needsApproval: boolean
}

/**
 * Assess a full command (may contain &&, ||, ;, |) by tokenizing into
 * sub-commands and evaluating each individually. Returns the highest tier.
 *
 * Tiers:
 *   safe      — LOW patterns (read-only)
 *   caution   — MEDIUM patterns (tooling, logged)
 *   dangerous — HIGH patterns (destructive) or unmatched
 *
 * Metacharacters (&&, ||, ;, |) are ALLOWED because cwd is locked in workspace.
 */
export function assessCommand(command: string): AssessResult {
  if (!command || typeof command !== 'string' || command.trim().length === 0) {
    return { tier: 'dangerous', subCommands: [], needsApproval: true }
  }

  const trimmed = command.trim()

  // Tokenize by separators
  const parts = trimmed.split(COMMAND_SEPARATOR).filter((p) => p.trim().length > 0)
  const subCommands: AssessResult['subCommands'] = []

  let highestTier: AssessTier = 'safe'

  for (const part of parts) {
    const sub = part.trim()
    // Classify sub-command against patterns
    let tier: AssessTier = 'dangerous'
    let matchedPattern: string | undefined

    for (const pattern of LOW_PATTERNS) {
      if (pattern.test(sub)) {
        tier = 'safe'
        matchedPattern = pattern.source
        break
      }
    }

    if (tier === 'dangerous') {
      for (const pattern of MEDIUM_PATTERNS) {
        if (pattern.test(sub)) {
          tier = 'caution'
          matchedPattern = pattern.source
          break
        }
      }
    }

    if (tier === 'dangerous') {
      for (const pattern of HIGH_PATTERNS) {
        if (pattern.test(sub)) {
          tier = 'dangerous'
          matchedPattern = pattern.source
          break
        }
      }
    }

    subCommands.push({ command: sub, tier, matchedPattern })

    // Promote highest tier
    if (tier === 'dangerous') highestTier = 'dangerous'
    else if (tier === 'caution' && highestTier !== 'dangerous') highestTier = 'caution'
  }

  return {
    tier: highestTier,
    subCommands,
    needsApproval: highestTier === 'dangerous',
  }
}

// ==================== CONSTANTS ====================

const MAX_COMMAND_LENGTH = 2000 // tăng từ 1000 để chứa multi-arg commands

// ==================== TYPES ====================

export interface ValidationResult {
  valid: boolean
  error?: string
  sanitized: string
  tier?: RiskTier
  matchedPattern?: string
}

export interface CwdValidationResult {
  valid: boolean
  resolvedPath?: string
  error?: string
}

// ==================== CORE VALIDATION ====================

/**
 * Validate a shell command with risk-tier classification.
 *
 * Flow:
 * 1. Basic checks (empty, length)
 * 2. Metacharacter block (always blocked)
 * 3. Injection pattern block (always blocked)
 * 4. Match against LOW → MEDIUM → HIGH patterns
 * 5. Return tier + sanitized command
 */
export function validateCommand(command: string): ValidationResult {
  if (!command || typeof command !== 'string') {
    return { valid: false, error: 'Command is required and must be a string', sanitized: '' }
  }

  const trimmed = command.trim()
  if (trimmed.length === 0) {
    return { valid: false, error: 'Command cannot be empty', sanitized: '' }
  }
  if (trimmed.length > MAX_COMMAND_LENGTH) {
    return {
      valid: false,
      error: `Command exceeds maximum length of ${MAX_COMMAND_LENGTH} characters`,
      sanitized: trimmed.substring(0, MAX_COMMAND_LENGTH),
    }
  }

  // === BLOCK: Metacharacters ===
  const metaMatch = trimmed.match(BLOCKED_METACHARS)
  if (metaMatch) {
    const chars = [...new Set(metaMatch)]
    return {
      valid: false,
      error: `Command contains forbidden characters: ${chars.map(c => JSON.stringify(c)).join(', ')}`,
      sanitized: trimmed.replace(BLOCKED_METACHARS, ''),
    }
  }

  // === BLOCK: Injection patterns ===
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        valid: false,
        error: `Command injection detected (pattern: ${pattern.source.substring(0, 30)})`,
        sanitized: sanitizeCommand(trimmed),
      }
    }
  }

  // === CLASSIFY: Risk Tier ===

  // Check LOW first
  for (const pattern of LOW_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        valid: true,
        sanitized: trimmed,
        tier: 'LOW',
        matchedPattern: pattern.source,
      }
    }
  }

  // Check MEDIUM
  for (const pattern of MEDIUM_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        valid: true,
        sanitized: trimmed,
        tier: 'MEDIUM',
        matchedPattern: pattern.source,
      }
    }
  }

  // Check HIGH
  for (const pattern of HIGH_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        valid: true,
        sanitized: trimmed,
        tier: 'HIGH',
        matchedPattern: pattern.source,
      }
    }
  }

  // === UNMATCHED → HIGH (caution) ===
  return {
    valid: true,
    sanitized: trimmed,
    tier: 'HIGH',
    matchedPattern: 'unmatched',
  }
}

// ==================== HELPERS ====================

/**
 * Check if a command at a given tier needs approval.
 * LOW/MEDIUM = auto, HIGH = approval required.
 */
export function needsApproval(tier: RiskTier): boolean {
  return tier === 'HIGH'
}

/**
 * Quick check: is this command safe to auto-run?
 */
export function isAutoApproved(command: string): boolean {
  const result = validateCommand(command)
  if (!result.valid || !result.tier) return false
  return result.tier === 'LOW' || result.tier === 'MEDIUM'
}

/**
 * Get tier description for logging.
 */
export function tierDescription(tier: RiskTier): string {
  switch (tier) {
    case 'LOW': return 'Read-only, safe'
    case 'MEDIUM': return 'Tooling, logged'
    case 'HIGH': return 'Destructive/mutation — approval required'
  }
}

/**
 * Sanitize a command by removing shell metacharacters.
 * Useful for cleaning user input before logging or displaying.
 */
export function sanitizeCommand(command: string): string {
  return command
    .trim()
    .replace(BLOCKED_METACHARS, '')
    .replace(/\$\(|`|\|\||&&|;/g, '')
    .substring(0, MAX_COMMAND_LENGTH)
}

// ==================== CWD VALIDATION ====================

/**
 * Validate and resolve a cwd (current working directory) path.
 * Ensures the path is within the project root to prevent directory traversal.
 */
export function validateCwd(cwd: string): CwdValidationResult {
  if (!cwd || typeof cwd !== 'string') {
    return { valid: true, resolvedPath: process.cwd() }
  }

  const trimmed = cwd.trim()

  try {
    const resolved = path.resolve(trimmed)
    const projectRoot = process.cwd()

    if (!resolved.startsWith(projectRoot)) {
      return {
        valid: false,
        error: `Path "${trimmed}" is outside the project directory. Access denied.`,
      }
    }

    return { valid: true, resolvedPath: resolved }
  } catch {
    return {
      valid: false,
      error: `Invalid path: "${trimmed}"`,
    }
  }
}

// ==================== ARGS VALIDATION ====================

/**
 * Validate args for dangerous properties before passing to bridge.
 * Prevents JSON traversal and prototype pollution attacks.
 */
export function validateArgs(args: unknown): { valid: boolean; error?: string } {
  if (args === null || args === undefined) {
    return { valid: true }
  }

  if (typeof args !== 'object') {
    return { valid: true }
  }

  try {
    const json = JSON.stringify(args)

    if (json.includes('__proto__') || json.includes('constructor')) {
      return {
        valid: false,
        error: 'Args contain forbidden prototype pollution patterns',
      }
    }

    return { valid: true }
  } catch {
    return { valid: false, error: 'Invalid args: not serializable' }
  }
}

// ==================== RE-EXPORT FOR BACKWARD COMPAT ====================

/**
 * @deprecated Use validateCommand from v2 which returns tier info.
 * Kept for backward compatibility with existing callers.
 */
export function validateCommandV1(command: string): { valid: boolean; error?: string; sanitized?: string } {
  const result = validateCommand(command)
  if (!result.valid) {
    return { valid: false, error: result.error, sanitized: result.sanitized }
  }
  if (result.tier === 'HIGH') {
    return { valid: false, error: `Command requires approval (tier: HIGH). Matched: "${result.matchedPattern}"`, sanitized: result.sanitized }
  }
  return { valid: true, sanitized: result.sanitized }
}