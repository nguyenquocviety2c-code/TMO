/**
 * Dynamic Project Paths Utility
 * 
 * Resolves project root and workspace paths dynamically,
 * so the project works on any machine without hardcoded paths.
 * 
 * - In Next.js: process.cwd() returns the project root
 * - In mini-services: paths are resolved relative to the project structure
 */

import { resolve } from 'path'

/**
 * Get the project root directory.
 * In Next.js, process.cwd() always returns the project root (where package.json lives).
 * Falls back to navigating up from __dirname if needed.
 */
export function getProjectRoot(): string {
  // Next.js always sets process.cwd() to the project root
  return process.cwd()
}

/**
 * Get the OpenCode workspace directory.
 * Reads OPENCODE_WORKSPACE from env (supports relative paths like '.')
 * and resolves it relative to the project root.
 */
export function getWorkspace(): string {
  const workspaceEnv = process.env.OPENCODE_WORKSPACE || '.'
  return resolve(getProjectRoot(), workspaceEnv)
}

/**
 * Get the OpenCode server directory (mini-services/opencode-server)
 */
export function getOpenCodeServerDir(): string {
  return resolve(getProjectRoot(), 'mini-services', 'opencode-server')
}

/**
 * Get the OpenCode server PID file path
 */
export function getOpenCodePidFile(): string {
  return resolve(getOpenCodeServerDir(), '.pid')
}

/**
 * Get the database directory
 */
export function getDbDir(): string {
  return resolve(getProjectRoot(), 'db')
}

/**
 * Get the upload directory
 */
export function getUploadDir(): string {
  return process.env.UPLOAD_DIR || resolve(getProjectRoot(), 'upload')
}
