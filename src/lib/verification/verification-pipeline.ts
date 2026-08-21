/**
 * Layer 4: Verification Pipeline
 *
 * Orchestrator gọi tuần tự 4 verifier:
 *   1. Static Verification (4.1)
 *   2. Runtime Verification (4.2)
 *   3. Visual Verification (4.3)
 *   4. Integration Verification (4.4)
 *
 * Aggregate kết quả và sinh recommendation.
 */

import { runStaticVerification } from './static-verifier'
import { runRuntimeVerification } from './runtime-verifier'
import { runVisualVerification } from './visual-verifier'
import { runIntegrationVerification } from './integration-verifier'
import type {
  VerificationReport,
  VerificationResult,
  VerificationError,
  VerificationPipelineOptions,
  VerificationRetryConfig,
} from './types'

// ==================== CONSTANTS ====================

const DEFAULT_TIMEOUT = 120_000 // 120s cho toàn pipeline

// ==================== MAIN ORCHESTRATOR ====================

/**
 * Chạy toàn bộ verification pipeline.
 *
 * @param sessionId - Session ID để log
 * @param stepId - Step vừa hoàn thành (VD: "G2-A/code")
 * @param options - Cấu hình từng verifier
 * @returns VerificationReport với aggregate kết quả
 */
export async function runVerificationPipeline(
  sessionId: string,
  stepId: string,
  options: VerificationPipelineOptions = {}
): Promise<VerificationReport> {
  const startTime = Date.now()
  const {
    static: staticOptions,
    runtime: runtimeOptions,
    visual: visualOptions,
    integration: integrationOptions,
    stopOnCritical = true,
    parallel = false,
  } = options

  // Default results (nếu verifier không chạy)
  const defaultStaticResult: VerificationResult = {
    verifier: 'static',
    passed: true,
    errors: [],
    warnings: [],
    duration: 0,
    summary: 'Static verification: SKIPPED',
  }

  const defaultRuntimeResult: VerificationResult = {
    verifier: 'runtime',
    passed: true,
    errors: [],
    warnings: [],
    duration: 0,
    summary: 'Runtime verification: SKIPPED',
  }

  const defaultVisualResult: VerificationResult = {
    verifier: 'visual',
    passed: true,
    errors: [],
    warnings: [],
    duration: 0,
    summary: 'Visual verification: SKIPPED',
  }

  const defaultIntegrationResult: VerificationResult = {
    verifier: 'integration',
    passed: true,
    errors: [],
    warnings: [],
    duration: 0,
    summary: 'Integration verification: SKIPPED',
  }

  let staticResult = defaultStaticResult
  let runtimeResult = defaultRuntimeResult
  let visualResult = defaultVisualResult
  let integrationResult = defaultIntegrationResult

  // Retry configuration
  const retryConfig: VerificationRetryConfig = options.retry || {
    maxRetries: 2,
    retryDelay: 1000,
    retryStrategy: 'FIX_AND_RETRY',
    retryOn: ['critical', 'high'],
  }

  try {
    if (parallel) {
      // Chạy song song (nhanh hơn nhưng tốn resource hơn)
      const [staticRes, runtimeRes, visualRes, integrationRes] = await Promise.all([
        staticOptions ? runWithRetry(() => runStaticVerification(staticOptions), retryConfig) : Promise.resolve(defaultStaticResult),
        runtimeOptions ? runWithRetry(() => runRuntimeVerification(runtimeOptions), retryConfig) : Promise.resolve(defaultRuntimeResult),
        visualOptions ? runWithRetry(() => runVisualVerification(visualOptions), retryConfig) : Promise.resolve(defaultVisualResult),
        integrationOptions ? runWithRetry(() => runIntegrationVerification(integrationOptions), retryConfig) : Promise.resolve(defaultIntegrationResult),
      ])

      staticResult = staticRes
      runtimeResult = runtimeRes
      visualResult = visualRes
      integrationResult = integrationRes
    } else {
      // Chạy tuần tự (mặc định)

      // 1. Static Verification
      if (staticOptions) {
        staticResult = await runWithRetry(() => runStaticVerification(staticOptions), retryConfig)
        if (stopOnCritical && hasCriticalError(staticResult)) {
          return buildReport(sessionId, stepId, startTime, staticResult, defaultRuntimeResult, defaultVisualResult, defaultIntegrationResult)
        }
      }

      // 2. Runtime Verification
      if (runtimeOptions) {
        runtimeResult = await runWithRetry(() => runRuntimeVerification(runtimeOptions), retryConfig)
        if (stopOnCritical && hasCriticalError(runtimeResult)) {
          return buildReport(sessionId, stepId, startTime, staticResult, runtimeResult, defaultVisualResult, defaultIntegrationResult)
        }
      }

      // 3. Visual Verification
      if (visualOptions) {
        visualResult = await runWithRetry(() => runVisualVerification(visualOptions), retryConfig)
        if (stopOnCritical && hasCriticalError(visualResult)) {
          return buildReport(sessionId, stepId, startTime, staticResult, runtimeResult, visualResult, defaultIntegrationResult)
        }
      }

      // 4. Integration Verification
      if (integrationOptions) {
        integrationResult = await runWithRetry(() => runIntegrationVerification(integrationOptions), retryConfig)
      }
    }

    return buildReport(sessionId, stepId, startTime, staticResult, runtimeResult, visualResult, integrationResult)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    const failedResult: VerificationResult = {
      verifier: 'static',
      passed: false,
      errors: [
        {
          type: 'e2e',
          severity: 'critical',
          message: `Verification pipeline failed: ${errorMsg}`,
          suggestion: 'Check verifier implementations and dependencies',
        },
      ],
      warnings: [],
      duration: Date.now() - startTime,
      summary: `Verification pipeline: FAILED (exception: ${errorMsg})`,
    }

    return buildReport(sessionId, stepId, startTime, failedResult, defaultRuntimeResult, defaultVisualResult, defaultIntegrationResult)
  }
}

// ==================== HELPERS ====================

/**
 * Kiểm tra nếu VerificationResult có critical error.
 */
function hasCriticalError(result: VerificationResult): boolean {
  return result.errors.some((error) => error.severity === 'critical')
}

/**
 * Chạy verifier với retry mechanism.
 * Nếu verifier fail với severity trong retryOn, sẽ retry sau retryDelay ms.
 */
async function runWithRetry(
  verifierFn: () => Promise<VerificationResult>,
  retryConfig: VerificationRetryConfig
): Promise<VerificationResult> {
  const { maxRetries, retryDelay, retryOn } = retryConfig
  
  let lastResult: VerificationResult | null = null
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      console.log(`Retry attempt ${attempt}/${maxRetries} after ${retryDelay}ms...`)
      await sleep(retryDelay)
    }
    
    const result = await verifierFn()
    lastResult = result
    
    // Check if we need to retry
    if (result.passed) {
      return result
    }
    
    const shouldRetry = result.errors.some((error) => 
      retryOn.includes(error.severity)
    )
    
    if (!shouldRetry || attempt === maxRetries) {
      return result
    }
  }
  
  return lastResult!
}

/**
 * Sleep utility function.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Build VerificationReport từ 4 verifier results.
 */
function buildReport(
  sessionId: string,
  stepId: string,
  startTime: number,
  staticResult: VerificationResult,
  runtimeResult: VerificationResult,
  visualResult: VerificationResult,
  integrationResult: VerificationResult
): VerificationReport {
  const allErrors: VerificationError[] = [
    ...staticResult.errors,
    ...runtimeResult.errors,
    ...visualResult.errors,
    ...integrationResult.errors,
  ]

  const criticalErrors = allErrors.filter((error) => error.severity === 'critical')
  const totalDuration = Date.now() - startTime
  const overallPassed = allErrors.filter((e) => e.severity !== 'low').length === 0

  return {
    sessionId,
    stepId,
    timestamp: Date.now(),
    static: staticResult,
    runtime: runtimeResult,
    visual: visualResult,
    integration: integrationResult,
    overallPassed,
    criticalErrors,
    totalDuration,
    recommendation: generateRecommendation(overallPassed, criticalErrors, allErrors),
  }
}

/**
 * Sinh recommendation dựa trên kết quả.
 */
function generateRecommendation(
  overallPassed: boolean,
  criticalErrors: VerificationError[],
  allErrors: VerificationError[]
): 'CONTINUE' | 'FIX_AND_RETRY' | 'ESCALATE' {
  if (!overallPassed) {
    if (criticalErrors.length > 0) {
      return 'ESCALATE'
    }
    if (allErrors.length > ERROR_THRESHOLD) {
      return 'FIX_AND_RETRY'
    }
  }

  return 'CONTINUE'
}

// Threshold for FIX_AND_RETRY recommendation
const ERROR_THRESHOLD = 5
