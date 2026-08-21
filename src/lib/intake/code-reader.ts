/**
 * Layer 1.2: Code Reading
 *
 * Đọc codebase, xây dựng mental model với:
 *   - Structure Scan: Map folder structure
 *   - Priority Reading: Đọc file quan trọng trước
 *   - Dependency Mapping: Parse import chains
 *   - Pattern Detection: Phát hiện patterns (shadcn, prisma, etc.)
 *   - Convention Learning: Học code style
 */

import fs from 'fs/promises'
import path from 'path'
import {
  type MentalModel,
  type ProjectStructure,
  type DependencyGraph,
  type DetectedPattern,
  type CodeConventions,
  type CodeReaderOptions,
} from './types'

// ==================== CONSTANTS ====================

/** Các file quan trọng cần đọc trước */
const PRIORITY_FILES = [
  'page.tsx',
  'layout.tsx',
  'schema.prisma',
  'next.config.ts',
  'tsconfig.json',
  'package.json',
  'tailwind.config.ts',
]

/** Các pattern cần phát hiện */
const PATTERNS_TO_DETECT: Array<{ type: DetectedPattern['type']; name: string; indicators: string[] }> = [
  { type: 'ui-library', name: 'shadcn/ui', indicators: ['@/components/ui', 'shadcn'] },
  { type: 'ui-library', name: 'mui', indicators: ['@mui/material'] },
  { type: 'orm', name: 'prisma', indicators: ['prisma', '@prisma/client'] },
  { type: 'orm', name: 'drizzle', indicators: ['drizzle-orm'] },
  { type: 'state-management', name: 'zustand', indicators: ['zustand'] },
  { type: 'state-management', name: 'redux', indicators: ['react-redux', '@reduxjs/toolkit'] },
  { type: 'data-fetching', name: 'tanstack-query', indicators: ['@tanstack/react-query'] },
  { type: 'realtime', name: 'socket.io', indicators: ['socket.io'] },
]

// ==================== CACHE ====================

/** Cache mental model để tránh đọc lại */
const mentalModelCache = new Map<string, { model: MentalModel; timestamp: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 phút

// ==================== MAIN FUNCTION ====================

/**
 * Xây dựng mental model của project.
 *
 * Luồng xử lý:
 *   1. scanStructure()     → Map folder structure
 *   2. priorityRead()      → Đọc file quan trọng
 *   3. mapDependencies()   → Parse import chains
 *   4. detectPatterns()    → Phát hiện patterns
 *   5. learnConventions()  → Học code style
 *
 * @param projectRoot - Đường dẫn gốc project
 * @param options - Cấu hình reader
 * @returns MentalModel
 */
export async function buildMentalModel(
  projectRoot: string,
  options: CodeReaderOptions = {},
): Promise<MentalModel> {
  const { forceRefresh = false, maxFiles = 100 } = options

  // Check cache
  if (!forceRefresh) {
    const cached = mentalModelCache.get(projectRoot)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.model
    }
  }

  // Step 1: Scan structure
  const structure = await scanStructure(projectRoot, maxFiles)

  // Step 2: Priority read
  const fileContents = await priorityRead(projectRoot, structure)

  // Step 3: Map dependencies
  const dependencies = mapDependencies(fileContents)

  // Step 4: Detect patterns
  const patterns = await detectPatterns(projectRoot, fileContents)

  // Step 5: Learn conventions
  const conventions = learnConventions(fileContents)

  const model: MentalModel = {
    structure,
    dependencies,
    patterns,
    conventions,
    readAt: new Date(),
  }

  // Cache
  mentalModelCache.set(projectRoot, { model, timestamp: Date.now() })

  return model
}

// ==================== STEP 1: STRUCTURE SCAN ====================

/**
 * Scan folder structure của project.
 */
async function scanStructure(projectRoot: string, maxFiles: number): Promise<ProjectStructure> {
  const structure: ProjectStructure = {
    pages: [],
    components: [],
    libs: [],
    apis: [],
    configs: [],
  }

  try {
    const entries = await fs.readdir(projectRoot, { withFileTypes: true, recursive: true })

    for (const entry of entries.slice(0, maxFiles)) {
      if (!entry.isFile()) continue

      const fullPath = path.join(entry.parentPath || projectRoot, entry.name)
      const relativePath = path.relative(projectRoot, fullPath)

      // Categorize
      if (relativePath.includes('/app/') && entry.name.endsWith('.tsx')) {
        structure.pages.push(relativePath)
      } else if (relativePath.includes('/components/') && entry.name.endsWith('.tsx')) {
        structure.components.push(relativePath)
      } else if (relativePath.includes('/lib/') && entry.name.endsWith('.ts')) {
        structure.libs.push(relativePath)
      } else if (relativePath.includes('/api/') && entry.name.endsWith('.ts')) {
        structure.apis.push(relativePath)
      } else if (entry.name.endsWith('.config.ts') || entry.name.endsWith('.config.js')) {
        structure.configs.push(relativePath)
      }
    }
  } catch (err) {
    console.warn('[CodeReader] Error scanning structure:', err)
  }

  return structure
}

// ==================== STEP 2: PRIORITY READ ====================

/**
 * Đọc các file quan trọng trước.
 */
async function priorityRead(
  projectRoot: string,
  structure: ProjectStructure,
): Promise<Map<string, string>> {
  const fileContents = new Map<string, string>()

  // Ưu tiên đọc các file trong PRIORITY_FILES
  const allFiles = [
    ...structure.pages,
    ...structure.components,
    ...structure.libs,
    ...structure.apis,
    ...structure.configs,
  ]

  const priorityPaths = PRIORITY_FILES.map(f => allFiles.find(p => p.endsWith(f))).filter(Boolean) as string[]

  for (const filePath of priorityPaths.slice(0, 20)) {
    try {
      const fullPath = path.join(projectRoot, filePath)
      const content = await fs.readFile(fullPath, 'utf-8')
      fileContents.set(filePath, content)
    } catch {
      // Skip files that can't be read
    }
  }

  return fileContents
}

// ==================== STEP 3: DEPENDENCY MAPPING ====================

/**
 * Parse import statements → dependency graph.
 */
function mapDependencies(fileContents: Map<string, string>): DependencyGraph {
  const nodes = new Map<string, string[]>()
  const entryPoints: string[] = []

  for (const [filePath, content] of fileContents) {
    const imports = extractImports(content)
    nodes.set(filePath, imports)

    // Entry point: file không được import bởi ai khác
    // (Đơn giản: giả định page.tsx và layout.tsx là entry points)
    if (filePath.endsWith('page.tsx') || filePath.endsWith('layout.tsx')) {
      entryPoints.push(filePath)
    }
  }

  return { nodes, entryPoints }
}

/**
 * Extract import paths từ file content.
 */
function extractImports(content: string): string[] {
  const imports: string[] = []
  const importRegex = /import\s+(?:{[^}]+}|\*\s+as\s+\w+|\w+)\s+ from\s+['"]([^'"]+)['"]/g

  let match
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1])
  }

  return imports
}

// ==================== STEP 4: PATTERN DETECTION ====================

/**
 * Phát hiện patterns từ package.json và imports.
 */
async function detectPatterns(
  projectRoot: string,
  fileContents: Map<string, string>,
): Promise<DetectedPattern[]> {
  const patterns: DetectedPattern[] = []
  const allContent = Array.from(fileContents.values()).join('\n')

  // Check package.json
  try {
    const pkgPath = path.join(projectRoot, 'package.json')
    const pkgContent = await fs.readFile(pkgPath, 'utf-8')
    const pkg = JSON.parse(pkgContent)
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }

    for (const pattern of PATTERNS_TO_DETECT) {
      const hasDep = pattern.indicators.some(ind => deps[ind])
      const hasImport = pattern.indicators.some(ind => allContent.includes(ind))

      if (hasDep || hasImport) {
        patterns.push({
          type: pattern.type,
          name: pattern.name,
          confidence: hasDep ? 0.95 : 0.7,
        })
      }
    }
  } catch {
    // Fallback: chỉ check imports
    for (const pattern of PATTERNS_TO_DETECT) {
      const hasImport = pattern.indicators.some(ind => allContent.includes(ind))
      if (hasImport) {
        patterns.push({
          type: pattern.type,
          name: pattern.name,
          confidence: 0.7,
        })
      }
    }
  }

  return patterns
}

// ==================== STEP 5: CONVENTION LEARNING ====================

/**
 * Học code style từ file contents.
 */
function learnConventions(fileContents: Map<string, string>): CodeConventions {
  const allContent = Array.from(fileContents.values()).join('\n')

  // Component naming
  const hasPascalCase = /export\s+(?:default\s+)?(?:function|const)\s+[A-Z][a-zA-Z0-9]*/.test(allContent)
  const componentNaming = hasPascalCase ? 'PascalCase' : 'camelCase'

  // Function naming
  const hasCamelCase = /function\s+[a-z][a-zA-Z0-9]*/.test(allContent)
  const functionNaming = hasCamelCase ? 'camelCase' : 'camelCase' // Default

  // File naming
  const hasKebabCase = /import\s+.*\s+from\s+['"][^'"]*\/[a-z][a-z0-9-]*\.tsx?['"]/.test(allContent)
  const fileNaming = hasKebabCase ? 'kebab-case' : 'PascalCase'

  // Import order (đơn giản: check có import react/next không)
  const importOrder: string[] = []
  if (allContent.includes("import React")) importOrder.push('react')
  if (allContent.includes("import {") && allContent.includes("from 'next")) importOrder.push('next')
  importOrder.push('third-party', 'local')

  return {
    componentNaming,
    functionNaming,
    fileNaming,
    importOrder,
  }
}

// ==================== CACHE INVALIDATION ====================

/**
 * Invalidate cache khi có file thay đổi.
 */
export function invalidateMentalModelCache(projectRoot: string): void {
  mentalModelCache.delete(projectRoot)
}