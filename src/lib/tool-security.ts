/**
 * Tool Security — Safety checks for tool execution
 *
 * Enforces security policies on tool arguments and execution:
 * - Dangerous command blocking (exec tool)
 * - Path traversal prevention (read/write/edit tools)
 * - Network access restrictions
 * - Argument validation
 */

import { join } from 'path'

// Dangerous commands that should be blocked
const BLOCKED_COMMANDS = [
  'rm -rf /',
  'rm -rf /*',
  'sudo rm',
  'mkfs',
  'dd if=',
  ':(){ :|:& };:',  // fork bomb
  'chmod 777 /',
  'chown root',
  '> /etc/passwd',
  '> /etc/shadow',
  'curl.*|.*sh',
  'wget.*|.*sh',
  'nc -l',
  '/dev/sda',
  'shutdown',
  'reboot',
  'init 0',
  'init 6',
]

// Allowed project directories for file operations
const PROJECT_ROOT = process.cwd()
const ALLOWED_PATHS = [
  PROJECT_ROOT,
  join(PROJECT_ROOT, 'skills'),
  join(PROJECT_ROOT, 'db'),
  join(PROJECT_ROOT, 'upload'),
]

// Validate command for exec tool
export function validateExecCommand(command: string): { safe: boolean; reason?: string } {
  const lowerCmd = command.toLowerCase().trim()

  // Check blocked commands
  for (const blocked of BLOCKED_COMMANDS) {
    if (blocked.includes('.*')) {
      // Regex pattern
      try {
        const regex = new RegExp(blocked, 'i')
        if (regex.test(lowerCmd)) {
          return { safe: false, reason: `Blocked dangerous command pattern: ${blocked}` }
        }
      } catch {
        // Invalid regex — skip
      }
    } else {
      if (lowerCmd.includes(blocked.toLowerCase())) {
        return { safe: false, reason: `Blocked dangerous command: ${blocked}` }
      }
    }
  }

  // Block writes to system directories
  const systemPaths = ['/etc/', '/sys/', '/proc/', '/boot/', '/root/', '/var/log/']
  for (const sysPath of systemPaths) {
    if (lowerCmd.includes(sysPath)) {
      return { safe: false, reason: `Blocked access to system directory: ${sysPath}` }
    }
  }

  return { safe: true }
}

// Validate file path for read/write/edit tools
export function validateFilePath(filePath: string): { safe: boolean; reason?: string } {
  // Block path traversal
  if (filePath.includes('..')) {
    return { safe: false, reason: 'Path traversal detected (..)' }
  }

  // Block absolute paths outside project
  if (filePath.startsWith('/') && !ALLOWED_PATHS.some(p => filePath.startsWith(p))) {
    return { safe: false, reason: `Access denied: path outside project directory` }
  }

  // Block sensitive files
  const sensitiveFiles = ['.env', '.ssh', '.gnupg', '.aws', 'id_rsa', 'id_ed25519']
  for (const sensitive of sensitiveFiles) {
    if (filePath.includes(sensitive)) {
      return { safe: false, reason: `Access denied: sensitive file (${sensitive})` }
    }
  }

  return { safe: true }
}

// Validate URL for web_fetch tool
export function validateUrl(url: string): { safe: boolean; reason?: string } {
  try {
    const parsed = new URL(url)

    // Only allow http/https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { safe: false, reason: `Blocked protocol: ${parsed.protocol}` }
    }

    // Block internal IPs (SSRF prevention)
    const hostname = parsed.hostname
    const internalPatterns = [
      /^localhost$/i,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^192\.168\./,
      /^0\./,
      /^::1$/,
      /^fd/i,
      /^fe80:/i,
      /^169\.254\./,
      /^metadata\.google\.internal$/i,
    ]

    for (const pattern of internalPatterns) {
      if (pattern.test(hostname)) {
        return { safe: false, reason: `Blocked internal address: ${hostname}` }
      }
    }

    return { safe: true }
  } catch {
    return { safe: false, reason: 'Invalid URL' }
  }
}

// General argument sanitization
export function sanitizeToolArgs(toolName: string, args: Record<string, unknown>): {
  safe: boolean
  sanitizedArgs: Record<string, unknown>
  warnings: string[]
} {
  const warnings: string[] = []
  const sanitizedArgs = { ...args }

  switch (toolName) {
    case 'exec': {
      const cmd = typeof args.command === 'string' ? args.command : ''
      const check = validateExecCommand(cmd)
      if (!check.safe) return { safe: false, sanitizedArgs: args, warnings: [check.reason!] }
      break
    }
    case 'read':
    case 'write':
    case 'edit':
    case 'apply_patch': {
      const path = typeof args.path === 'string' ? args.path : typeof args.file === 'string' ? args.file : ''
      const check = validateFilePath(path)
      if (!check.safe) return { safe: false, sanitizedArgs: args, warnings: [check.reason!] }
      break
    }
    case 'web_fetch': {
      const url = typeof args.url === 'string' ? args.url : ''
      const check = validateUrl(url)
      if (!check.safe) return { safe: false, sanitizedArgs: args, warnings: [check.reason!] }
      break
    }
    case 'code_execution': {
      // Block obviously dangerous code patterns
      const code = typeof args.code === 'string' ? args.code : ''
      const dangerousCodePatterns = [
        /require\s*\(\s*['"]child_process['"]/,  // No child_process
        /process\.exit/,                           // No process exit
        /import\s+.*from\s+['"]child_process['"]/, // No child_process import
      ]
      for (const pattern of dangerousCodePatterns) {
        if (pattern.test(code)) {
          return { safe: false, sanitizedArgs: args, warnings: [`Blocked dangerous code pattern in code_execution`] }
        }
      }
      break
    }
    case 'cron': {
      // Validate cron action — only allow safe actions
      const action = typeof args.action === 'string' ? args.action : ''
      const safeActions = ['list', 'create', 'delete', 'update']
      if (action && !safeActions.includes(action)) {
        return { safe: false, sanitizedArgs: args, warnings: [`Blocked unknown cron action: ${action}`] }
      }
      break
    }
    case 'sessions_spawn': {
      // Validate spawn — prevent spawning with dangerous prompts
      const prompt = typeof args.prompt === 'string' ? args.prompt : ''
      const dangerousSpawnPatterns = [
        /rm\s+-rf/i,
        /delete\s+all/i,
        /wipe/i,
      ]
      for (const pattern of dangerousSpawnPatterns) {
        if (pattern.test(prompt)) {
          return { safe: false, sanitizedArgs: args, warnings: [`Blocked dangerous spawn prompt`] }
        }
      }
      break
    }
  }

  return { safe: true, sanitizedArgs, warnings }
}
