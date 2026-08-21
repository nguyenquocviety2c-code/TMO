/**
 * Layer 4: Verification — Shared Types
 *
 * Định nghĩa tất cả types/interfaces cho 4 quy trình kiểm chứng:
 *   4.1 Static Verification
 *   4.2 Runtime Verification
 *   4.3 Visual Verification
 *   4.4 Integration Verification
 */

// ==================== CORE TYPES ====================

/** Loại verifier */
export type VerifierType = 'static' | 'runtime' | 'visual' | 'integration'

/** Mức độ nghiêm trọng của lỗi */
export type ErrorSeverity = 'critical' | 'high' | 'medium' | 'low'

/** Loại lỗi verification */
export type VerificationErrorType =
  // Static errors
  | 'lint'
  | 'type'
  | 'import'
  | 'convention'
  // Runtime errors
  | 'runtime'
  | 'api'
  | 'db'
  | 'websocket'
  // Visual errors
  | 'render'
  | 'layout'
  | 'interaction'
  | 'console'
  // Integration errors
  | 'e2e'
  | 'data_consistency'
  | 'error_propagation'

/** Một lỗi verification */
export interface VerificationError {
  type: VerificationErrorType
  severity: ErrorSeverity
  message: string
  file?: string
  line?: number
  column?: number
  suggestion?: string
}

/** Cảnh báo (không block) */
export interface VerificationWarning {
  type: string
  message: string
  file?: string
}

/** Kết quả của một lần verification */
export interface VerificationResult {
  verifier: VerifierType
  passed: boolean
  errors: VerificationError[]
  warnings: VerificationWarning[]
  duration: number // ms
  summary: string
}

/** Aggregate kết quả từ cả 4 verifier */
export interface VerificationReport {
  sessionId: string
  stepId: string // step vừa hoàn thành
  timestamp: number
  static: VerificationResult
  runtime: VerificationResult
  visual: VerificationResult
  integration: VerificationResult
  overallPassed: boolean
  criticalErrors: VerificationError[]
  totalDuration: number
  recommendation: 'CONTINUE' | 'FIX_AND_RETRY' | 'ESCALATE'
}

// ==================== STATIC VERIFICATION OPTIONS ====================

export interface StaticVerifyOptions {
  runLint?: boolean // default: true
  runTypeCheck?: boolean // default: true
  runImportCheck?: boolean // default: true
  runConventionCheck?: boolean // default: false
  timeout?: number // default: 30_000ms
}

// ==================== RUNTIME VERIFICATION OPTIONS ====================

export interface RuntimeVerifyOptions {
  checkDevServer?: boolean // default: true
  testApis?: string[] // API endpoints cần test
  testDb?: boolean // default: false
  testWebSocket?: boolean // default: false
  timeout?: number // default: 60_000ms
}

// ==================== VISUAL VERIFICATION OPTIONS ====================

export interface VisualVerifyOptions {
  checkRender?: boolean // default: true
  checkLayout?: boolean // default: false
  checkInteraction?: boolean // default: false
  checkConsoleErrors?: boolean // default: true
  urls?: string[] // URLs cần kiểm tra
  timeout?: number // default: 45_000ms
}

// ==================== INTEGRATION VERIFICATION OPTIONS ====================

export interface IntegrationVerifyOptions {
  checkFullFlow?: boolean // default: true
  checkDataConsistency?: boolean // default: true
  checkErrorPropagation?: boolean // default: true
  timeout?: number // default: 90_000ms
}

// ==================== RETRY CONFIGURATION ====================

/** Chiến lược retry khi verification fail */
export type RetryStrategy = 'FIX_AND_RETRY' | 'REFRESH_AND_RETRY' | 'SKIP'

/** Cấu hình retry cho verification pipeline */
export interface VerificationRetryConfig {
  maxRetries: number // default: 2
  retryDelay: number // default: 1000ms
  retryStrategy: RetryStrategy // default: 'FIX_AND_RETRY'
  retryOn: ErrorSeverity[] // default: ['critical', 'high']
}

// ==================== PIPELINE OPTIONS ====================

export interface VerificationPipelineOptions {
  static?: StaticVerifyOptions
  runtime?: RuntimeVerifyOptions
  visual?: VisualVerifyOptions
  integration?: IntegrationVerifyOptions
  stopOnCritical?: boolean // default: true — dừng nếu có critical error
  parallel?: boolean // default: false — chạy tuần tự
  retry?: VerificationRetryConfig // NEW: cấu hình retry
}

// ==================== E2E FLOW TYPES ====================

/** Một bước trong E2E flow */
export interface E2EFlowStep {
  name: string
  action: 'navigate' | 'click' | 'fill' | 'submit' | 'wait' | 'assert'
  target?: string // selector hoặc URL
  value?: string // giá trị điền vào
  expectedResult?: string // kết quả mong đợi
}

/** Định nghĩa một E2E flow */
export interface E2EFlow {
  name: string
  steps: E2EFlowStep[]
}

// ==================== ACTION TYPES FOR VISUAL VERIFIER ====================

/** Một hành động tương tác trong visual verification */
export interface VisualAction {
  type: 'click' | 'fill' | 'submit' | 'navigate' | 'wait'
  selector?: string
  value?: string
  url?: string
  delay?: number // ms
}

// ==================== SSE EVENT TYPES ====================

/** Event type cho verification SSE */
export type VerificationEventType =
  | 'verification_start'
  | 'verification_complete'
  | 'verification_error'

/** Verification SSE event */
export interface VerificationEvent {
  type: VerificationEventType
  sessionId: string
  stepId: string
  verifier?: VerifierType
  result?: VerificationResult
  report?: VerificationReport
  error?: string
}