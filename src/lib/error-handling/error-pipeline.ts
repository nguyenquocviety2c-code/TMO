/**
 * Layer 5: Error Handling Pipeline (Orchestrator)
 *
 * Orchestrate 4 modules tuần tự:
 *   1. Error Detection
 *   2. Root Cause Analysis
 *   3. Loop Detection
 *   4. Error Recovery
 *
 * Quyết định final action: FIXED / RETRY / PIVOT / ESCALATE / CONTINUE
 */

import type {
  ErrorHandlingInput,
  ErrorHandlingReport,
  ErrorAction,
  ErrorClassification,
  RootCauseAnalysis,
  ErrorRecoveryResult,
  LoopDetectionResult,
  ErrorRecord,
} from './types'

import { detectError } from './error-detector'
import { analyzeRootCause, analyzeRootCauseQuick } from './root-cause-analyzer'
import { detectLoop } from './loop-detector'
import { recoverFromError } from './error-recovery'

// ==================== DECISION MATRIX ====================

/**
 * Quyết định hành động cuối cùng dựa trên kết quả của 4 modules.
 */
function decideAction(
  classification: ErrorClassification,
  recovery: ErrorRecoveryResult,
  loopStatus: LoopDetectionResult,
  options: ErrorHandlingInput['options']
): ErrorAction {
  const { severity } = classification

  // 1. Low severity → CONTINUE (non-blocking)
  if (severity === 'low') {
    return 'CONTINUE'
  }

  // 2. Loop detected + should escalate → ESCALATE
  if (loopStatus.shouldEscalate) {
    return 'ESCALATE'
  }

  // 3. Loop detected (but not escalate) → PIVOT
  if (loopStatus.isLoop && loopStatus.pivotStrategy) {
    return 'PIVOT'
  }

  // 4. Recovery success → FIXED
  if (recovery.success) {
    return 'FIXED'
  }

  // 5. Recovery fail + chưa max retries → RETRY
  const maxRetries = options?.maxRetries ?? 3
  if (loopStatus.loopCount < maxRetries) {
    return 'RETRY'
  }

  // 6. Recovery fail + max retries → ESCALATE
  return 'ESCALATE'
}

// ==================== ERROR RECORD BUILDER ====================

/**
 * Tạo ErrorRecord từ kết quả xử lý lỗi để persist vào worklog.
 */
function buildErrorRecord(
  classification: ErrorClassification,
  rootCause: RootCauseAnalysis,
  recovery: ErrorRecoveryResult,
  loopStatus: LoopDetectionResult
): ErrorRecord {
  return {
    id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date(),
    errorType: classification.errorType,
    severity: classification.severity,
    message: classification.message,
    rootCause: rootCause.rootCause,
    fixStrategy: recovery.strategy,
    fixApplied: recovery.success,
    fixDescription: recovery.fixDescription,
    loopDetected: loopStatus.isLoop,
    loopCount: loopStatus.loopCount,
  }
}

// ==================== MAIN PIPELINE ====================

/**
 * Xử lý lỗi từ agent step.
 * Orchestrate  modules tuần tự và quyết định hành động cuối cùng.
 *
 * @param input - ErrorHandlingInput
 * @returns ErrorHandlingReport
 */
export async function handleStepError(
  input: ErrorHandlingInput
): Promise<ErrorHandlingReport> {
  const startTime = Date.now()
  const { error, context, previousErrors, worklog, options } = input

  try {
    // ===== STEP 1: ERROR DETECTION =====
    const classification = detectError(error)

    // ===== STEP 2: ROOT CAUSE ANALYSIS =====
    // Chỉ phân tích nếu severity >= high
    let rootCause: RootCauseAnalysis
    if (classification.severity === 'critical' || classification.severity === 'high') {
      rootCause = await analyzeRootCause(error, classification, worklog)
    } else {
      rootCause = analyzeRootCauseQuick(classification)
    }

    // ===== STEP 3: LOOP DETECTION =====
    const loopStatus = detectLoop(classification, previousErrors)

    // ===== STEP 4: ERROR RECOVERY =====
    let recovery: ErrorRecoveryResult
    if (options?.autoFix !== false && !loopStatus.shouldEscalate) {
      recovery = await recoverFromError(classification, rootCause, context)
    } else {
      // autoFix = false hoặc should escalate → không tự động fix
      recovery = {
        strategy: 'surgical',
        fixDescription: 'Auto-fix disabled hoặc should escalate',
        reVerification: { passed: false, details: 'Skipped' },
        success: false,
        failureReason: 'Auto-fix disabled hoặc should escalate',
      }
    }

    // ===== STEP 5: DECISION =====
    const finalAction = decideAction(classification, recovery, loopStatus, options)

    // ===== STEP 6: BUILD REPORT =====
    const duration = Date.now() - startTime

    const summary = buildSummary(
      classification,
      rootCause,
      recovery,
      loopStatus,
      finalAction
    )

    return {
      sessionId: input.sessionId,
      stepId: input.stepId,
      detected: classification,
      rootCause,
      recovery,
      loopStatus,
      finalAction,
      summary,
      timestamp: new Date(),
      duration,
    }
  } catch (pipelineError) {
    // Pipeline itself failed → escalate
    const errorMsg = pipelineError instanceof Error ? pipelineError.message : String(pipelineError)
    console.error('[ErrorPipeline] Pipeline failed:', errorMsg)

    return {
      sessionId: input.sessionId,
      stepId: input.stepId,
      detected: detectError(error),
      rootCause: {
        hypothesis: 'Pipeline failed',
        verification: 'N/A',
        rootCause: `Error handling pipeline failed: ${errorMsg}`,
        confidence: 0,
        relatedFiles: [],
        duration: 0,
      },
      recovery: {
        strategy: 'surgical',
        fixDescription: 'Pipeline failed',
        reVerification: { passed: false, details: errorMsg },
        success: false,
        failureReason: errorMsg,
      },
      loopStatus: {
        isLoop: false,
        loopCount: 0,
        previousAttempts: [],
        shouldEscalate: true,
        escalateReason: 'Error handling pipeline failed',
      },
      finalAction: 'ESCALATE',
      summary: `Error handling pipeline failed: ${errorMsg}. Escalating to user.`,
      timestamp: new Date(),
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Build summary string từ kết quả xử lý lỗi.
 */
function buildSummary(
  classification: ErrorClassification,
  rootCause: RootCauseAnalysis,
  recovery: ErrorRecoveryResult,
  loopStatus: LoopDetectionResult,
  finalAction: ErrorAction
): string {
  const parts: string[] = []

  parts.push(`[${classification.errorType.toUpperCase()}] ${classification.message.slice(0, 100)}`)
  parts.push(`Severity: ${classification.severity}`)
  parts.push(`Root cause: ${rootCause.rootCause.slice(0, 150)}`)
  parts.push(`Fix: ${recovery.strategy} — ${recovery.success ? 'SUCCESS' : 'FAILED'}`)
  parts.push(`Loop: ${loopStatus.isLoop ? `YES (${loopStatus.loopCount} times)` : 'NO'}`)
  parts.push(`Action: ${finalAction}`)

  return parts.join(' | ')
}

// ==================== EXPORT ERROR RECORD BUILDER ====================

/**
 * Export hàm buildErrorRecord để sử dụng ở nơi khác.
 */
export { buildErrorRecord }