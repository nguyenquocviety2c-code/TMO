/**
 * Verify-Fix Loop — Automated verification + fix iteration
 *
 * Phase 2: After BOLT implements code, SENTINEL runs verification.
 * If verification fails, SENTINEL attempts to fix, then re-verify.
 * Max 3 iterations, then escalate to TL if still failing.
 *
 * Flow:
 *   1. Run verification (static + runtime)
 *   2. If pass → done
 *   3. If fail → SENTINEL analyzes errors, attempts fix
 *   4. Re-verify → repeat up to 3 times
 *   5. If still failing after 3 → escalate to TL with error summary
 */

import { runStaticVerification, runRuntimeVerification } from '@/lib/verification'
import type { VerificationResult } from '@/lib/verification/types'

// ==================== CONSTANTS ====================

const MAX_ITERATIONS = 3

// ==================== TYPES ====================

export interface VerifyFixResult {
  passed: boolean
  iterations: number
  finalErrors: string[]
  finalWarnings: string[]
  fixAttempts: FixAttempt[]
  escalated: boolean
  escalateReason?: string
}

export interface FixAttempt {
  iteration: number
  errorsBefore: string[]
  fixApplied: string // Description of what was fixed
  errorsAfter: string[]
  passed: boolean
}

// ==================== MAIN LOOP ====================

/**
 * Run the verify-fix loop.
 *
 * @param onFixNeeded - Callback when verification fails. Receives errors,
 *   should return a description of the fix applied. This is where the
 *   LLM (SENTINEL) would be called to analyze and fix errors.
 *   In automated mode, this can be a no-op that just logs.
 * @returns VerifyFixResult with full iteration history
 */
export async function runVerifyFixLoop(
  onFixNeeded?: (errors: string[], iteration: number) => Promise<string>
): Promise<VerifyFixResult> {
  const fixAttempts: FixAttempt[] = []
  let escalated = false
  let escalateReason: string | undefined

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    console.log(`[VerifyFixLoop] Iteration ${iteration}/${MAX_ITERATIONS} — running verification...`)

    // Run both static and runtime verification
    const [staticResult, runtimeResult] = await Promise.all([
      runStaticVerification({ runLint: true, runTypeCheck: true, runImportCheck: true }),
      runRuntimeVerification({ checkDevServer: true, testDb: false }),
    ])

    const allErrors = [
      ...(staticResult.errors || []),
      ...(runtimeResult.errors || []),
    ]
    const allWarnings = [
      ...(staticResult.warnings || []),
      ...(runtimeResult.warnings || []),
    ]

    const passed = staticResult.passed && runtimeResult.passed

    if (passed) {
      console.log(`[VerifyFixLoop] ✅ Passed on iteration ${iteration}`)
      return {
        passed: true,
        iterations: iteration,
        finalErrors: [],
        finalWarnings: allWarnings,
        fixAttempts,
        escalated: false,
      }
    }

    // Verification failed — attempt fix
    console.log(`[VerifyFixLoop] ❌ Failed iteration ${iteration} — ${allErrors.length} errors`)

    let fixApplied = '(no fix callback provided)'
    if (onFixNeeded) {
      try {
        fixApplied = await onFixNeeded(allErrors, iteration)
        console.log(`[VerifyFixLoop] Fix applied: ${fixApplied.slice(0, 200)}`)
      } catch (err) {
        console.error(`[VerifyFixLoop] Fix callback error: ${err instanceof Error ? err.message : String(err)}`)
        fixApplied = `Fix callback failed: ${err instanceof Error ? err.message : String(err)}`
      }
    }

    fixAttempts.push({
      iteration,
      errorsBefore: allErrors,
      fixApplied,
      errorsAfter: [], // Will be filled on next iteration's verification
      passed: false,
    })

    // Update previous attempt's errorsAfter with current errors
    if (fixAttempts.length > 1) {
      fixAttempts[fixAttempts.length - 2].errorsAfter = allErrors
    }
  }

  // All iterations exhausted — escalate
  escalateReason = `Verification failed after ${MAX_ITERATIONS} fix iterations. ${fixAttempts[fixAttempts.length - 1]?.errorsBefore.length || 0} errors remaining.`
  console.warn(`[VerifyFixLoop] 🔴 Escalating: ${escalateReason}`)
  escalated = true

  // Run final verification to get current error state
  const [finalStatic, finalRuntime] = await Promise.all([
    runStaticVerification({ runLint: true, runTypeCheck: true, runImportCheck: true }),
    runRuntimeVerification({ checkDevServer: true, testDb: false }),
  ])

  return {
    passed: false,
    iterations: MAX_ITERATIONS,
    finalErrors: [
      ...(finalStatic.errors || []),
      ...(finalRuntime.errors || []),
    ],
    finalWarnings: [
      ...(finalStatic.warnings || []),
      ...(finalRuntime.warnings || []),
    ],
    fixAttempts,
    escalated,
    escalateReason,
  }
}

// ==================== TOOL EXECUTOR ====================

/**
 * Execute verify_fix_loop tool from LLM function calling.
 * Called by tool-executor.ts switch case.
 *
 * This is a simplified version that just runs verification and returns results.
 * The actual fix logic is driven by the LLM (SENTINEL) in the ReAct loop —
 * the tool provides verification results, LLM decides what to fix.
 */
export async function executeVerifyFixLoopTool(
  options?: { runLint?: boolean; runTypeCheck?: boolean; runRuntime?: boolean }
): Promise<{
  passed: boolean
  staticErrors: string[]
  staticWarnings: string[]
  runtimeErrors: string[]
  runtimeWarnings: string[]
  summary: string
}> {
  const runLint = options?.runLint ?? true
  const runTypeCheck = options?.runTypeCheck ?? true
  const runRuntime = options?.runRuntime ?? true

  const results: {
    staticErrors: string[]
    staticWarnings: string[]
    runtimeErrors: string[]
    runtimeWarnings: string[]
  } = {
    staticErrors: [],
    staticWarnings: [],
    runtimeErrors: [],
    runtimeWarnings: [],
  }

  // Static verification
  if (runLint || runTypeCheck) {
    try {
      const staticResult = await runStaticVerification({
        runLint,
        runTypeCheck,
        runImportCheck: false,
      })
      results.staticErrors = staticResult.errors || []
      results.staticWarnings = staticResult.warnings || []
    } catch (err) {
      results.staticErrors.push(`Static verification crashed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Runtime verification
  if (runRuntime) {
    try {
      const runtimeResult = await runRuntimeVerification({
        checkDevServer: true,
        testDb: false,
      })
      results.runtimeErrors = runtimeResult.errors || []
      results.runtimeWarnings = runtimeResult.warnings || []
    } catch (err) {
      results.runtimeErrors.push(`Runtime verification crashed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const totalErrors = results.staticErrors.length + results.runtimeErrors.length
  const passed = totalErrors === 0

  return {
    passed,
    ...results,
    summary: passed
      ? '✅ All checks passed'
      : `❌ ${totalErrors} errors: ${results.staticErrors.length} static, ${results.runtimeErrors.length} runtime`,
  }
}