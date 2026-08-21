/**
 * Layer 4: Verification — Public API
 *
 * Barrel export cho toàn bộ verification module.
 */

// ==================== TYPES ====================

export type {
  // Core types
  VerifierType,
  ErrorSeverity,
  VerificationErrorType,
  VerificationError,
  VerificationWarning,
  VerificationResult,
  VerificationReport,
  // Options
  StaticVerifyOptions,
  RuntimeVerifyOptions,
  VisualVerifyOptions,
  IntegrationVerifyOptions,
  VerificationPipelineOptions,
  // Retry
  RetryStrategy,
  VerificationRetryConfig,
  // E2E & Visual
  E2EFlow,
  E2EFlowStep,
  VisualAction,
  // SSE
  VerificationEventType,
  VerificationEvent,
} from './types'

// ==================== VERIFIERS ====================

export { runStaticVerification } from './static-verifier'
export { runRuntimeVerification } from './runtime-verifier'
export { runVisualVerification } from './visual-verifier'
export { runIntegrationVerification } from './integration-verifier'

// ==================== PIPELINE ====================

export { runVerificationPipeline } from './verification-pipeline'