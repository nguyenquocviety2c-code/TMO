import path from 'path'

/**
 * Path Guard Module
 * 
 * Provides path traversal protection for file operations.
 * Ensures all file paths are within the project root directory.
 */

const PROJECT_ROOT = process.cwd()

/**
 * Check if a resolved path is within the project root.
 * @param filePath The path to check (can be relative or absolute)
 * @returns true if the path is within the project root
 */
export function isPathWithinProject(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') return false

  const resolved = path.resolve(filePath)
  
  // Normalize for comparison
  const normalizedProject = path.normalize(PROJECT_ROOT)
  const normalizedPath = path.normalize(resolved)

  // Ensure it's within project root
  return (
    normalizedPath === normalizedProject ||
    normalizedPath.startsWith(normalizedProject + path.sep)
  )
}

/**
 * Resolve and validate a file path, ensuring it's within the project.
 * @param filePath The path to resolve and validate
 * @returns The resolved path if valid, or null if invalid
 */
export function resolveProjectPath(filePath: string): string | null {
  if (!filePath || typeof filePath !== 'string') return null

  const resolved = path.resolve(filePath)
  
  if (!isPathWithinProject(resolved)) {
    return null
  }

  return resolved
}

/**
 * Sanitize a filename to prevent directory traversal in file names.
 * Removes path separators and normalizes the filename.
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') return ''
  
  return filename
    .replace(/[\\/]/g, '') // Remove path separators
    .replace(/^\.+/, '')   // Remove leading dots
    .trim()
}