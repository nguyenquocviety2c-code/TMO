/**
 * Layer 1.3: Context Assembly
 *
 * Chọn lọc & nén context vào context window với:
 *   - Relevance-based filtering
 *   - Dependency-based expansion
 *   - Compression (summary/signature)
 *   - Progressive loading
 */

import fs from 'fs/promises'
import path from 'path'
import {
  type IntentResult,
  type MentalModel,
  type SelectedFile,
  type AssembledContext,
  type AssemblyOptions,
} from './types'

// ==================== CONSTANTS ====================

/** Giới hạn token mặc định */
const DEFAULT_MAX_TOKENS = 8000

/** Ngưỡng token để chuyển sang strategy nhỏ hơn */
const COMPRESSION_THRESHOLDS = {
  full: 500,      // File < 500 dòng → đọc full
  summary: 1000,  // File 500-1000 dòng → tóm tắt
  signature: 2000, // File > 1000 dòng → chỉ lấy signature
}

// ==================== MAIN FUNCTION ====================

/**
 * Assemble context từ intent và mental model.
 *
 * Luồng xử lý:
 *   1. relevanceFilter()     → Chọn files liên quan + đọc nội dung
 *   2. dependencyExpand()    → Mở rộng theo dependencies
 *   3. compress()            → Nén files dài
 *   4. progressiveLoad()     → Sắp xếp theo priority
 *
 * @param task - Kết quả phân tích intent
 * @param mentalModel - Mental model của project
 * @param options - Cấu hình assembly
 * @returns AssembledContext
 */
export async function assembleContext(
  task: IntentResult,
  mentalModel: MentalModel,
  options: AssemblyOptions = {},
): Promise<AssembledContext> {
  const { maxTokens = DEFAULT_MAX_TOKENS, strategy = 'hybrid', projectRoot = process.cwd() } = options

  // Step 1: Relevance filter (đọc nội dung file thực tế)
  const relevantFiles = await relevanceFilter(task, mentalModel, projectRoot)

  // Step 2: Dependency expand
  const expandedFiles = dependencyExpand(relevantFiles, mentalModel)

  // Step 3: Compress
  const compressedFiles = compress(expandedFiles, mentalModel)

  // Step 4: Progressive load (sắp xếp + giới hạn token)
  const assembled = progressiveLoad(compressedFiles, maxTokens, strategy)

  // Tính compression ratio
  const originalTokens = estimateTokens(expandedFiles.map(f => f.content || '').join('\n'))
  const assembledTokens = estimateTokens(assembled.files.map(f => f.content || '').join('\n'))
  const compressionRatio = originalTokens > 0 ? originalTokens / assembledTokens : 1

  return {
    files: assembled.files,
    totalTokens: assembledTokens,
    compressionRatio,
    strategy,
  }
}

// ==================== STEP 1: RELEVANCE FILTER ====================

/**
 * Chọn files liên quan đến task và đọc nội dung.
 */
async function relevanceFilter(task: IntentResult, mentalModel: MentalModel, projectRoot: string): Promise<SelectedFile[]> {
  const files: SelectedFile[] = []
  const { taskType, constraints } = task

  // Task về UI → ưu tiên components, pages
  if (taskType === 'create' || taskType === 'modify' || taskType === 'hybrid') {
    if (constraints.framework === 'next.js') {
      for (const p of mentalModel.structure.pages) {
        const content = await readFileSafe(path.join(projectRoot, p))
        files.push({ path: p, relevance: 0.9, strategy: 'full', content })
      }
      for (const c of mentalModel.structure.components) {
        const content = await readFileSafe(path.join(projectRoot, c))
        files.push({ path: c, relevance: 0.85, strategy: 'full', content })
      }
    }
  }

  //OSS Task về API → ưu tiên API routes
  if (taskType === 'create' || taskType === 'modify') {
    if (constraints.api || task.summary.toLowerCase().includes('api')) {
      for (const a of mentalModel.structure.apis) {
        const content = await readFileSafe(path.join(projectRoot, a))
        files.push({ path: a, relevance: 0.9, strategy: 'full', content })
      }
    }
  }

  // Task về DB → ưu tiên schema
  if (taskType === 'create' || taskType === 'modify') {
    if (constraints.database === 'prisma') {
      const schemaFile = mentalModel.structure.configs.find(c => c.includes('schema.prisma'))
      if (schemaFile) {
        const content = await readFileSafe(path.join(projectRoot, schemaFile))
        files.push({ path: schemaFile, relevance: 0.95, strategy: 'full', content })
      }
    }
  }

  // Task fix → ưu tiên tất cả files (cần tìm bug)
  if (taskType === 'fix') {
    for (const f of [...mentalModel.structure.pages, ...mentalModel.structure.components, ...mentalModel.structure.libs]) {
      const content = await readFileSafe(path.join(projectRoot, f))
      files.push({ path: f, relevance: 0.7, strategy: 'full', content })
    }
  }

  // Task analyze → ưu tiên libs và components
  if (taskType === 'analyze') {
    for (const f of [...mentalModel.structure.libs, ...mentalModel.structure.components]) {
      const content = await readFileSafe(path.join(projectRoot, f))
      files.push({ path: f, relevance: 0.8, strategy: 'full', content })
    }
  }

  // Task refactor → ưu tiên libs và components
  if (taskType === 'refactor') {
    for (const f of [...mentalModel.structure.libs, ...mentalModel.structure.components]) {
      const content = await readFileSafe(path.join(projectRoot, f))
      files.push({ path: f, relevance: 0.85, strategy: 'full', content })
    }
  }

  // Luôn thêm config files với relevance thấp
  for (const c of mentalModel.structure.configs) {
    const content = await readFileSafe(path.join(projectRoot, c))
    files.push({ path: c, relevance: 0.5, strategy: 'summary', content })
  }

  return files
}

/**
 * Đọc file an toàn, trả về empty string nếu lỗi.
 */
async function readFileSafe(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch {
    return ''
  }
}

// ==================== STEP 2: DEPENDENCY EXPAND ====================

/**
 * Mở rộng files theo dependencies.
 */
function dependencyExpand(files: SelectedFile[], mentalModel: MentalModel): SelectedFile[] {
  const expanded = [...files]
  const addedPaths = new Set(files.map(f => f.path))

  for (const file of files) {
    // Tìm files mà file này import
    const imports = mentalModel.dependencies.nodes.get(file.path) || []

    for (const importPath of imports) {
      // Chỉ thêm local imports (bắt đầu với ./ hoặc ../ hoặc @/)
      if (importPath.startsWith('./') || importPath.startsWith('../') || importPath.startsWith('@/')) {
        if (!addedPaths.has(importPath)) {
          expanded.push({
            path: importPath,
            relevance: file.relevance * 0.8, // Giảm relevance
            strategy: 'full',
          })
          addedPaths.add(importPath)
        }
      }
    }
  }

  return expanded
}

// ==================== STEP 3: COMPRESSION ====================

/**
 * Nén files dài.
 */
function compress(files: SelectedFile[], _mentalModel: MentalModel): SelectedFile[] {
  return files.map(file => {
    // Đơn giản: giả định file dài nếu path chứa 'page' hoặc 'layout'
    // (Trong thực tế nên đọc file và đếm dòng)
    const isLongFile = file.path.includes('page') || file.path.includes('layout')

    if (isLongFile && file.strategy === 'full') {
      return {
        ...file,
        strategy: 'summary',
        content: `// Summary of ${file.path}\n// (File too long, showing key exports and types only)`,
      }
    }

    return file
  })
}

// ==================== STEP 4: PROGRESSIVE LOAD ====================

/**
 * Sắp xếp files theo priority và giới hạn token.
 */
function progressiveLoad(
  files: SelectedFile[],
  maxTokens: number,
  strategy: string,
): { files: SelectedFile[] } {
  // Sắp xếp theo relevance giảm dần
  const sorted = [...files].sort((a, b) => b.relevance - a.relevance)

  // Giới hạn số files dựa trên maxTokens (ước lượng)
  const selected: SelectedFile[] = []
  let currentTokens = 0

  for (const file of sorted) {
    const estimatedTokens = estimateTokens(file.content || file.path)
    if (currentTokens + estimatedTokens > maxTokens) {
      break
    }
    selected.push(file)
    currentTokens += estimatedTokens
  }

  return { files: selected }
}

// ==================== HELPERS ====================

/**
 * Ước lượng số token từ text.
 * Đơn giản: 1 token ≈ 4 characters (English) hoặc 1.5 characters (Vietnamese/Chinese)
 */
function estimateTokens(text: string): number {
  // Đơn giản: giả định 1 token ≈ 3 characters
  return Math.ceil(text.length / 3)
}