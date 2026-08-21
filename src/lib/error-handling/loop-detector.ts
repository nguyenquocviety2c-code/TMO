/**
 * Layer 5.4: Loop Detection & Recovery
 *
 * Phát hiện fix loop — khi cùng một lỗi xuất hiện nhiều lần với cùng một cách sửa.
 * Anti-pattern: Sửa → lỗi → sửa cùng cách → vẫn lỗi → sửa cùng cách → vẫn lỗi...
 */

import type {
  ErrorClassification,
  ErrorRecord,
  LoopDetectionResult,
  FixStrategy,
} from './types'

// ==================== SIMILARITY CHECKING ====================

/**
 * Tính độ tương đồng giữa hai error messages.
 * Dùng simple string similarity (Levenshtein distance approximation).
 */
function messageSimilarity(a: string, b: string): number {
  const aLower = a.toLowerCase()
  const bLower = b.toLowerCase()

  // Exact match
  if (aLower === bLower) return 1.0

  // Contains
  if (aLower.includes(bLower) || bLower.includes(aLower)) return 0.8

  // Word overlap
  const aWords = new Set(aLower.split(/\s+/))
  const bWords = new Set(bLower.split(/\s+/))
  const common = Array.from(aWords).filter(w => bWords.has(w))
  const total = new Set([...Array.from(aWords), ...Array.from(bWords)]).size

  return common.length / total
}

/**
 * Kiểm tra xem hai lỗi có phải cùng một lỗi không.
 * @param a - ErrorClassification từ lỗi hiện tại
 * @param b - ErrorRecord từ lịch sử (hoặc ErrorClassification)
 */
function isSameError(a: ErrorClassification, b: ErrorRecord | ErrorClassification): boolean {
  // Cùng file + cùng line → chắc chắn cùng lỗi
  if (a.file && b.file && a.file === b.file && a.line && b.line && a.line === b.line) {
    return true
  }

  // Cùng error type + message tương tự → có thể cùng lỗi
  if (a.errorType === b.errorType) {
    const sim = messageSimilarity(a.message, b.message)
    if (sim >= 0.7) {
      return true
    }
  }

  return false
}

// ==================== LOOP DETECTION ====================

/**
 * Phát hiện fix loop bằng cách so sánh lỗi hiện tại với lịch sử.
 *
 * @param currentError - Lỗi hiện tại (đã được classify)
 * @param previousErrors - Lịch sử lỗi của session
 * @returns LoopDetectionResult
 */
export function detectLoop(
  currentError: ErrorClassification,
  previousErrors: ErrorRecord[]
): LoopDetectionResult {
  const startTime = Date.now()

  // Lọc các previous errors cùng type
  const sameTypeErrors = previousErrors.filter(e => e.errorType === currentError.errorType)

  // Tìm các lỗi tương tự (same error)
  const similarErrors = sameTypeErrors.filter(e =>
    isSameError(currentError, {
      errorType: e.errorType,
      severity: e.severity,
      message: e.message,
      file: e.message.match(/([^\s(]+[.](?:ts|tsx|js|jsx)(?::\d+:\d+)?)/)?.[1],
      timestamp: e.timestamp,
    } as ErrorClassification)
  )

  const loopCount = similarErrors.length

  // Nếu chưa có lỗi tương tự trước đó → không phải loop
  if (loopCount === 0) {
    return {
      isLoop: false,
      loopCount: 0,
      previousAttempts: [],
      shouldEscalate: false,
    }
  }

  // Build previous attempts
  const previousAttempts = similarErrors.map(e => ({
    timestamp: e.timestamp,
    fixStrategy: e.fixStrategy || 'surgical',
    fixDescription: e.fixDescription || 'Unknown fix',
    result: e.fixApplied ? ('success' as const) : ('failure' as const),
  }))

  // Kiểm tra xem có phải loop không
  // Loop = lỗi hiện tại trùng với ≥1 lỗi trước đó (fix trước không hiệu quả → nên đổi strategy)
  const isLoop = loopCount >= 1

  // Đề xuất pivot strategy
  let pivotStrategy: FixStrategy | undefined
  if (isLoop) {
    pivotStrategy = suggestPivotStrategy(similarErrors)
  }

  // Quyết định escalate
  const shouldEscalate = loopCount >= 3

  const duration = Date.now() - startTime

  return {
    isLoop,
    loopCount,
    previousAttempts,
    pivotStrategy,
    shouldEscalate,
    escalateReason: shouldEscalate
      ? `Cùng lỗi đã xuất hiện ${loopCount} lần với các fix strategies trước đó không hiệu quả. Cần escalate để hỏi user.`
      : isLoop
        ? `Cùng lỗi đã xuất hiện ${loopCount} lần. Đề xuất đổi strategy.`
        : undefined,
  }
}

/**
 * Đề xuất chiến lược pivot khi phát hiện loop.
 */
function suggestPivotStrategy(similarErrors: ErrorRecord[]): FixStrategy {
  // Lấy các strategies đã thử
  const triedStrategies = new Set(similarErrors.map(e => e.fixStrategy).filter(Boolean))

  // Nếu chưa thử surgical → thử surgical
  if (!triedStrategies.has('surgical')) {
    return 'surgical'
  }

  // Nếu đã thử surgical → thử refactoring
  if (!triedStrategies.has('refactoring')) {
    return 'refactoring'
  }

  // Nếu đã thử refactoring → thử redesign
  if (!triedStrategies.has('redesign')) {
    return 'redesign'
  }

  // Nếing đã thử redesign → rollback
  if (!triedStrategies.has('rollback')) {
    return 'rollback'
  }

  // Nếu đã thử tất cả → redesign (most aggressive)
  return 'redesign'
}

// ==================== LOOP PREVENTION HELPERS ====================

/**
 * Kiểm tra xem một fix có phải là anti-pattern không.
 */
export function isAntiPatternFix(
  fixDescription: string
): { isAntiPattern: boolean; reason?: string } {
  const antiPatterns = [
    {
      pattern: /\/\/ @ts-ignore/i,
      reason: 'Dùng @ts-ignore thay vì fix type error gốc',
    },
    {
      pattern: /try\s*\{[\s\S]*?\}\s*catch\s*\([^)]*\)\s*\{\s*\}/i,
      reason: 'Wrap trong try-catch rỗng thay vì handle error đúng cách',
    },
    {
      pattern: /\/\/ eslint-disable/i,
      reason: 'Disable ESLint rule thay vì fix root cause',
    },
    {
      pattern: /any\[\]/i,
      reason: 'Dùng any[] thay vì định nghĩa type đúng',
    },
    {
      pattern: /as any/i,
      reason: 'Dùng as any để bypass type checking',
    },
  ]

  for (const { pattern, reason } of antiPatterns) {
    if (pattern.test(fixDescription)) {
      return { isAntiPattern: true, reason }
    }
  }

  return { isAntiPattern: false }
}

/**
 * Kiểm tra xem có nên cho phép retry không.
 */
export function shouldAllowRetry(
  loopResult: LoopDetectionResult,
  maxRetries: number
): boolean {
  if (!loopResult.isLoop) return true
  return loopResult.loopCount < maxRetries
}

/**
 * Tạo escalation message cho user.
 */
export function createEscalationMessage(
  loopResult: LoopDetectionResult,
  error: ErrorClassification
): string {
  const attempts = loopResult.previousAttempts
    .map(
      (a, i) =>
        `  ${i + 1}. ${a.fixStrategy}: ${a.fixDescription} (${a.result === 'success' ? 'thành công' : 'thất bại'})`
    )
    .join('\n')

  return `Tôi đã thử sửa lỗi này ${loopResult.loopCount} lần nhưng chưa thành công:\n\n` +
    `Lỗi: ${error.message.slice(0, 200)}\n\n` +
    `Các lần thử trước:\n${attempts}\n\n` +
    `Bạn có gợi ý gì không? Hoặc tôi nên thử approach khác?`
}