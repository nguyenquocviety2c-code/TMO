/**
 * Layer 5: Error Handling — Public API
 *
 * Export tất cả types và functions cho external use.
 * Các modules internal không cần export trực tiếp.
 */

// ==================== TYPES ====================
export type {
  ErrorType,
  ErrorSeverity,
  FixStrategy,
  ErrorAction,
  ErrorClassification,
  RootCauseAnalysis,
  ErrorRecoveryResult,
  LoopDetectionResult,
  ErrorRecord,
  ErrorContext,
  ToolCallLog,
  VerificationReport,
  VerificationResult,
  ErrorHandlingInput,
  ErrorHandlingOptions,
  WorklogEntry,
  WorklogIssue,
  CodeLocationMap,
  ErrorHandlingReport,
} from './types'

// ==================== ERROR DETECTION ====================
export {
  detectError,
  detectMultipleErrors,
  parseTypeScriptOutput,
  parseESLintOutput,
  getHighestSeverity,
  isCriticalError,
  isBlockingError,
} from './error-detector'

// ==================== ROOT CAUSE ANALYSIS ====================
export {
  analyzeRootCause,
  analyzeRootCauseQuick,
} from './root-cause-analyzer'

// ==================== LOOP DETECTION ====================
export {
  detectLoop,
  isAntiPatternFix,
  shouldAllowRetry,
  createEscalationMessage,
} from './loop-detector'

// ==================== ERROR RECOVERY ====================
export {
  recoverFromError,
  selectRecoveryStrategy,
  selectFixStrategy,
} from './error-recovery'

// ==================== ERROR PIPELINE (ORCHESTRATOR) ====================
export {
  handleStepError,
  buildErrorRecord,
} from './error-pipeline'