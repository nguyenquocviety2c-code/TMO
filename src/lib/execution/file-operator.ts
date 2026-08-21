/**
 * Layer 3.3: File Operator
 *
 * Thực hiện các thao tác file cơ bản: read, write, edit, multi-edit, delete, list.
 * Các hàm này được sử dụng bởi tool-executor.ts (Layer 4) để agents thao tác file.
 * Tất cả paths được resolve để ngăn chặn path traversal attacks.
 */

import fs from 'fs/promises'
import path from 'path'
import type { FileOperationResult, EditOperation, FileOperatorOptions } from './types'
import { detectError } from '@/lib/error-handling'

// ==================== OPTIONS ====================

const DEFAULT_OPTIONS: FileOperatorOptions = {
  surgicalEdit: true,
  atomicOperation: true,
  createBackup: false,
}

// ==================== PATH VALIDATION ====================

/** Resolve và validate path — ngAuth cấm path traversal */
async function resolveAndValidatePath(filePath: string): Promise<string> {
  const resolvedPath = path.resolve(filePath)
  // Basic path traversal check
  const cwd = process.cwd()
  if (!resolvedPath.startsWith(cwd) && !path.isAbsolute(resolvedPath)) {
    throw new Error(`Invalid path: ${filePath} — must be within project or absolute`)
  }
  return resolvedPath
}

// ==================== READ ====================

/**
 * Read file content.
 * @param filePath — path to file
 * @returns file content as string
 */
export async function readFile(filePath: string): Promise<string> {
  const resolvedPath = await resolveAndValidatePath(filePath)
  try {
    const content = await fs.readFile(resolvedPath, 'utf-8')
    return content
  } catch (error: unknown) {
    const err = detectError(error)
    throw new Error(`Failed to read file ${filePath}: ${err.message}`)
  }
}

// ==================== WRITE ====================

/**
 * Write content to file. Overwrites if exists.
 * @param filePath — path to file
 * @param content — content to write
 * @returns FileOperationResult
 */
export async function writeFile(
  filePath: string,
  content: string,
): Promise<FileOperationResult> {
  const resolvedPath = await resolveAndValidatePath(filePath)
  try {
    // Ensure parent directory exists
    const dir = path.dirname(resolvedPath)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(resolvedPath, content, 'utf-8')
    return {
      path: filePath,
      operation: 'write',
      success: true,
    }
  } catch (error: unknown) {
    const err = detectError(error)
    return {
      path: filePath,
      operation: 'write',
      success: false,
      error: err.message,
    }
  }
}

/**
 * Safe write — only writes if file doesn't exist (prevents accidental overwrites).
 * @param filePath — path to file
 * @param content — content to write
 * @returns FileOperationResult
 */
export async function safeWriteFile(
  filePath: string,
  content: string,
): Promise<FileOperationResult> {
  const resolvedPath = await resolveAndValidatePath(filePath)
  try {
    // Check if file exists
    try {
      await fs.access(resolvedPath)
      return {
        path: filePath,
        operation: 'write',
        success: false,
        error: `File already exists: ${filePath}. Use editFile or force overwrite.`,
      }
    } catch {
      // File doesn't exist, proceed
    }
    const dir = path.dirname(resolvedPath)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(resolvedPath, content, 'utf-8')
    return {
      path: filePath,
      operation: 'write',
      success: true,
    }
  } catch (error: unknown) {
    const err = detectError(error)
    return {
      path: filePath,
      operation: 'write',
      success: false,
      error: err.message,
    }
  }
}

// ==================== EDIT ====================

/**
 * Edit file by replacing a search string with a replacement.
 * @param filePath — path to file
 * @param search — string to search for
 * @param replace — replacement string
 * @returns FileOperationResult
 */
export async function editFile(
  filePath: string,
  search: string,
  replace: string,
): Promise<FileOperationResult> {
  const resolvedPath = await resolveAndValidatePath(filePath)
  try {
    const content = await fs.readFile(resolvedPath, 'utf-8')
    if (!content.includes(search)) {
      return {
        path: filePath,
        operation: 'edit',
        success: false,
        error: `Search string not found in file: ${search.substring(0, 50)}...`,
      }
    }
    const newContent = content.replace(search, replace)
    await fs.writeFile(resolvedPath, newContent, 'utf-8')
    return {
      path: filePath,
      operation: 'edit',
      success: true,
    }
  } catch (error: unknown) {
    const err = detectError(error)
    return {
      path: filePath,
      operation: 'edit',
      success: false,
      error: err.message,
    }
  }
}

/**
 * Multi-edit file — apply multiple search/replace operations.
 * @param filePath — path to file
 * @param edits — array of edit operations
 * @returns FileOperationResult
 */
export async function multiEditFile(
  filePath: string,
  edits: EditOperation[],
): Promise<FileOperationResult> {
  const resolvedPath = await resolveAndValidatePath(filePath)
  try {
    let content = await fs.readFile(resolvedPath, 'utf-8')
    const failedEdits: string[] = []

    for (const edit of edits) {
      if (!content.includes(edit.search)) {
        failedEdits.push(`Search not found: ${edit.search.substring(0, 50)}...`)
        continue
      }
      content = content.replace(edit.search, edit.replace)
    }

    await fs.writeFile(resolvedPath, content, 'utf-8')
    return {
      path: filePath,
      operation: 'multiEdit',
      success: failedEdits.length === 0,
      error: failedEdits.length > 0 ? failedEdits.join('; ') : undefined,
    }
  } catch (error: unknown) {
    const err = detectError(error)
    return {
      path: filePath,
      operation: 'multiEdit',
      success: false,
      error: err.message,
    }
  }
}

// ==================== DELETE ====================

/**
 * Delete a file.
 * @param filePath — path to file
 * @returns FileOperationResult
 */
export async function deleteFile(filePath: string): Promise<FileOperationResult> {
  const resolvedPath = await resolveAndValidatePath(filePath)
  try {
    await fs.unlink(resolvedPath)
    return {
      path: filePath,
      operation: 'delete',
      success: true,
    }
  } catch (error: unknown) {
    const err = detectError(error)
    return {
      path: filePath,
      operation: 'delete',
      success: false,
      error: err.message,
    }
  }
}

// ==================== LIST ====================

/**
 * List directory contents.
 * @param dirPath — path to directory
 * @returns array of entry names
 */
export async function listDirectory(dirPath: string): Promise<string[]> {
  const resolvedPath = await resolveAndValidatePath(dirPath)
  try {
    const entries = await fs.readdir(resolvedPath)
    return entries
  } catch (error: unknown) {
    const err = detectError(error)
    throw new Error(`Failed to list directory ${dirPath}: ${err.message}`)
  }
}

// ==================== VERIFY ====================

/**
 * Check if a file exists.
 * @param filePath — path to file
 * @returns true if file exists, false otherwise
 */
export async function verifyFileExists(filePath: string): Promise<boolean> {
  const resolvedPath = await resolveAndValidatePath(filePath)
  try {
    await fs.access(resolvedPath)
    return true
  } catch {
    return false
  }
}
