/**
 * Layer 5.2: Root Cause Analysis
 *
 * Phân tích nguyên nhân gốc của lỗi.
 * Trace stack, đọc file liên quan, form hypothesis, verify, identify root cause.
 */

import type { ErrorClassification, RootCauseAnalysis, WorklogEntry } from './types'

// ==================== FILE READING UTILITIES ====================

/** Đọc file từ filesystem (async) */
async function readFile(filePath: string): Promise<string | null> {
  try {
    const fs = await import('fs/promises')
    const path = await import('path')
    const resolved = path.resolve(process.cwd(), filePath)
    const content = await fs.readFile(resolved, 'utf-8')
    return content
  } catch {
    return null
  }
}

/** Trích xuất các file được import từ một file */
function extractImports(content: string): string[] {
  const imports: string[] = []
  const importPattern = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g
  let match: RegExpExecArray | null

  while ((match = importPattern.exec(content)) !== null) {
    imports.push(match[1])
  }

  return imports
}

/** Tìm type definitions liên quan từ error message */
function findRelatedTypeDefinitions(errorMessage: string, fileContent: string): string[] {
  const typePatterns = [
    /interface\s+(\w+)/g,
    /type\s+(\w+)/g,
    /class\s+(\w+)/g,
  ]

  const foundTypes: string[] = []

  for (const pattern of typePatterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(fileContent)) !== null) {
      const typeName = match[1]
      if (errorMessage.includes(typeName)) {
        foundTypes.push(typeName)
      }
    }
  }

  return foundTypes
}

// ==================== HYPOTHESIS GENERATION ====================

/**
 * Form hypothesis dựa trên error type và context.
 */
function formHypothesis(
  classification: ErrorClassification,
  fileContent: string | null,
  worklog: WorklogEntry[]
): string {
  const { errorType, message, file } = classification

  // Hypothesis dựa trên error type
  switch (errorType) {
    case 'compile':
      return `Lỗi compile ở file ${file}: Có thể do syntax error, missing import, hoặc module không tồn tại. Cần kiểm tra cú pháp và import paths.`

    case 'type':
      // Kiểm tra xem có phải type mismatch do interface thay đổi không
      if (message.includes('is not assignable')) {
        return `Type mismatch: Code expect type A nhưng nhận type B. Có thể do interface thay đổi, hoặc function return type không đúng.`
      }
      if (message.includes('does not exist')) {
        return `Missing property: Object không có property này. Có thể do typo, hoặc object structure thay đổi.`
      }
      return `Type error: TypeScript type system phát hiện mismatch. Cần kiểm tra type definitions và usage.`

    case 'runtime':
      if (message.includes('Cannot read property') || message.includes('undefined')) {
        return `Runtime error: Truy cập property trên undefined/null. Có thể do data chưa được khởi tạo, hoặc API trả về unexpected format.`
      }
      if (message.includes('is not a function')) {
        return `Type error at runtime: Biến không phải function. Có thể do import sai, hoặc object structure khác với expected.`
      }
      return `Runtime error: Lỗi xảy ra khi code chạy. Cần trace execution path.`

    case 'hydration':
      return `Hydration mismatch: Server render khác với client render. Có thể do sử dụng Date/random trên server, hoặc conditional rendering.`

    case 'api':
      if (message.includes('404')) {
        return `API 404: Endpoint không tồn tại. Có thể do route chưa được define, hoặc URL sai.`
      }
      if (message.includes('500')) {
        return `API 500: Server error. Cần kiểm tra server logs và error handling.`
      }
      if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
        return `API timeout: Request quá lâu. Có thể do query chậm, hoặc server quá tải.`
      }
      return `API error: Kiểm tra endpoint, params, và authentication.`

    case 'network':
      return `Network error: Kiểm tra kết nối mạng, CORS config, và service availability.`

    case 'logic':
      return `Logic error: Code chạy nhưng cho kết quả sai. Cần review algorithm và edge cases.`

    case 'lint':
      return `Lint warning: Code style issue. Không ảnh hưởng functionality.`

    default:
      return `Unknown error: Cần phân tích thêm để xác định nguyên nhân.`
  }
}

// ==================== VERIFICATION ====================

/**
 * Verify hypothesis bằng cách đọc thêm code và cross-reference.
 */
async function verifyHypothesis(
  hypothesis: string,
  classification: ErrorClassification,
  fileContent: string | null,
  worklog: WorklogEntry[]
): Promise<{ verified: boolean; details: string }> {
  const { errorType, file, message } = classification

  // Nếu không có file content, không thể verify
  if (!fileContent) {
    return { verified: false, details: 'Không thể đọc file để verify hypothesis' }
  }

  // Verify dựa trên error type
  if (errorType === 'type') {
    // Kiểm tra xem có type definition nào bị thay đổi không
    const relatedTypes = findRelatedTypeDefinitions(message, fileContent)
    if (relatedTypes.length > 0) {
      return {
        verified: true,
        details: `Tìm thấy type definitions liên quan: ${relatedTypes.join(', ')}. Hypothesis được xác nhận.`,
      }
    }
  }

  if (errorType === 'runtime') {
    // Kiểm tra xem có optional chaining hoặc null check không
    if (fileContent.includes('?.') || fileContent.includes('!== undefined')) {
      return {
        verified: true,
        details: 'File có sử dụng defensive programming (optional chaining/null checks). Hypothesis về undefined/null được xác nhận.',
      }
    }
  }

  if (errorType === 'hydration') {
    // Kiểm tra xem có sử dụng Date/random không
    if (fileContent.includes('Date()') || fileContent.includes('Math.random()')) {
      return {
        verified: true,
        details: 'File sử dụng Date() hoặc Math.random() — nguyên nhân phổ biến của hydration mismatch.',
      }
    }
  }

  // Kiểm tra worklog xem có similar issues không
  const similarIssues = worklog.filter(w =>
    w.issues.some(i => i.description.toLowerCase().includes(message.toLowerCase().slice(0, 50)))
  )

  if (similarIssues.length > 0) {
    return {
      verified: true,
      details: `Tìm thấy ${similarIssues.length} worklog entries với similar issues. Hypothesis được hỗ trợ bởi historical data.`,
    }
  }

  return {
    verified: false,
    details: 'Không đủ evidence để xác nhận hypothesis. Cần phân tích thêm.',
  }
}

// ==================== MAIN FUNCTION ====================

/**
 * Phân tích nguyên nhân gốc của lỗi.
 *
 * @param error - Raw error
 * @param classification - Kết quả phân loại lỗi
 * @param worklog - Toàn bộ worklog để trace
 * @returns RootCauseAnalysis
 */
export async function analyzeRootCause(
  error: Error | string,
  classification: ErrorClassification,
  worklog: WorklogEntry[]
): Promise<RootCauseAnalysis> {
  const startTime = Date.now()
  const { file, errorType, message } = classification

  // Bước 1: Đọc file chứa error
  let fileContent: string | null = null
  if (file) {
    fileContent = await readFile(file)
  }

  // Bước 2: Đọc các file import (nếu có)
  const relatedFiles: string[] = []
  if (fileContent) {
    const imports = extractImports(fileContent)
    for (const imp of imports) {
      // Chỉ lấy relative imports (bỏ node_modules)
      if (imp.startsWith('.') || imp.startsWith('/')) {
        relatedFiles.push(imp)
      }
    }
  }

  // Bước 3: Form hypothesis
  const hypothesis = formHypothesis(classification, fileContent, worklog)

  // Bước 4: Verify hypothesis
  const verificationResult = await verifyHypothesis(hypothesis, classification, fileContent, worklog)

  // Bước 5: Identify root cause
  let rootCause: string

  if (verificationResult.verified) {
    rootCause = `${hypothesis} (Verified: ${verificationResult.details})`
  } else {
    // Nếu không verify được, dùng heuristic
    rootCause = `${hypothesis} (Unverified — cần manual investigation)`
  }

  // Thêm context từ worklog
  const recentWorklog = worklog.slice(-3) // 3 entries gần nhất
  if (recentWorklog.length > 0) {
    const recentIssues = recentWorklog.flatMap(w => w.issues)
    if (recentIssues.length > 0) {
      rootCause += ` | Recent issues: ${recentIssues.map(i => i.description.slice(0, 100)).join('; ')}`
    }
  }

  const duration = Date.now() - startTime

  return {
    hypothesis,
    verification: verificationResult.details,
    rootCause,
    confidence: verificationResult.verified ? 0.8 : 0.5,
    relatedFiles: file ? [file, ...relatedFiles] : relatedFiles,
    duration,
  }
}

/**
 * Phân tích nhanh (lightweight) — không đọc file, chỉ dựa trên message.
 * Dùng khi cần kết quả nhanh.
 */
export function analyzeRootCauseQuick(
  classification: ErrorClassification
): RootCauseAnalysis {
  const { errorType, message, file } = classification

  let rootCause: string

  switch (errorType) {
    case 'compile':
      rootCause = `Compile error ở ${file || 'unknown file'}: ${message.slice(0, 200)}`
      break
    case 'type':
      rootCause = `Type error: ${message.slice(0, 200)}`
      break
    case 'runtime':
      rootCause = `Runtime error: ${message.slice(0, 200)}`
      break
    default:
      rootCause = `${errorType} error: ${message.slice(0, 200)}`
  }

  return {
    hypothesis: `Quick analysis: ${rootCause}`,
    verification: 'Skipped (quick mode)',
    rootCause,
    // Quick heuristic (no LLM verification) — confidence must stay below the 0.5 "verified" bar
    confidence: 0.4,
    relatedFiles: file ? [file] : [],
    duration: 0,
  }
}