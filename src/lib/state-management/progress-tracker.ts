/**
 * Layer 6.1: Progress Tracking
 *
 * Theo dõi tiến độ workflow: step status, results, token usage, time spent.
 * Được khởi tạo từ DecompositionPlan (Layer 2) và cập nhật sau mỗi step.
 */

import type {
  ProgressState,
  ProgressTracker,
  StepState,
  StepResult,
  ProgressReport,
} from './types'
import type { StepStatus } from '@/lib/code-team/types'
import type { DecompositionPlan } from '@/lib/thinking'

// ==================== CONSTANTS ====================

/** Default token budget cho một workflow */
const DEFAULT_TOKEN_BUDGET = 100_000

// ==================== HELPER FUNCTIONS ====================

/**
 * Ước tính thời gian còn lại dựa trên average time per step.
 * FIX #12: Định nghĩa rõ giải thuật estimateRemainingTime()
 */
function estimateRemainingTime(state: ProgressState): string {
  if (state.completedSteps === 0) return 'calculating...'

  const elapsed = Date.now() - new Date(state.startedAt).getTime()
  const avgTimePerStep = elapsed / state.completedSteps
  const remainingSteps = state.totalSteps - state.completedSteps
  const remainingMs = avgTimePerStep * remainingSteps

  const minutes = Math.floor(remainingMs / 60000)
  const seconds = Math.floor((remainingMs % 60000) / 1000)

  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

/**
 * Tính phần trăm tiến độ.
 */
function calculateProgressPercentage(state: ProgressState): number {
  if (state.totalSteps === 0) return 0
  return Math.round((state.completedSteps / state.totalSteps) * 100)
}

// ==================== FACTORY ====================

/**
 * Tạo ProgressTracker từ DecompositionPlan.
 *
 * @param plan - Kế hoạch phân rã từ Layer 2 (Thinking)
 * @returns ProgressTracker instance
 */
export function createProgressTracker(plan: DecompositionPlan): ProgressTracker {
  const now = new Date().toISOString()

  // Khởi tạo steps từ subTasks của DecompositionPlan
  const steps: Record<string, StepState> = {}
  for (let i = 0; i < plan.subTasks.length; i++) {
    const st = plan.subTasks[i]
    const stepId = `step-${i + 1}`
    steps[stepId] = {
      id: stepId,
      type: st.type as StepState['type'],
      status: 'pending',
      agentPosition: 'TL', // Sẽ được cập nhật khi routing
      description: st.description,
      tokensBudgeted: st.estimatedTokens,
    }
  }

  const state: ProgressState = {
    planId: `plan-${Date.now()}`,
    totalSteps: plan.subTasks.length,
    completedSteps: 0,
    failedSteps: 0,
    currentStep: 0,
    steps,
    totalTokensUsed: 0,
    totalTokensBudgeted: plan.totalEstimatedTokens || DEFAULT_TOKEN_BUDGET,
    totalTimeSpent: 0,
    errors: [],
    startedAt: now,
    lastUpdatedAt: now,
  }

  // ==================== INTERNAL METHODS ====================

  function updateTimestamp(): void {
    state.lastUpdatedAt = new Date().toISOString()
  }

  function recalculateTotals(): void {
    state.completedSteps = Object.values(state.steps).filter(
      s => s.status === 'completed'
    ).length
    state.failedSteps = Object.values(state.steps).filter(
      s => s.status === 'failed'
    ).length
    state.currentStep = Object.values(state.steps).filter(
      s => s.status === 'in_progress'
    ).length
  }

  // ==================== PUBLIC API ====================

  return {
    getState(): ProgressState {
      return JSON.parse(JSON.stringify(state)) // Deep clone để tránh mutation từ bên ngoài
    },

    updateStepStatus(stepId: string, status: StepStatus): void {
      const step = state.steps[stepId]
      if (!step) {
        console.warn(`[ProgressTracker] Step ${stepId} not found`)
        return
      }

      const now = new Date().toISOString()

      if (status === 'in_progress' && step.status === 'pending') {
        step.startedAt = now
      }

      if (status === 'completed' || status === 'failed') {
        step.completedAt = now
        if (step.startedAt) {
          step.timeSpent = new Date(now).getTime() - new Date(step.startedAt).getTime()
        }
      }

      step.status = status
      recalculateTotals()
      updateTimestamp()

      console.log(
        `[ProgressTracker] Step ${stepId} → ${status} (${state.completedSteps}/${state.totalSteps})`
      )
    },

    recordStepResult(stepId: string, result: StepResult): void {
      const step = state.steps[stepId]
      if (!step) {
        console.warn(`[ProgressTracker] Step ${stepId} not found`)
        return
      }

      step.result = result
      updateTimestamp()

      console.log(
        `[ProgressTracker] Step ${stepId} result: ${result.success ? 'success' : 'failed'} | Files: ${result.filesCreated.length} created, ${result.filesModified.length} modified`
      )
    },

    getProgressReport(): ProgressReport {
      const percentage = calculateProgressPercentage(state)
      const estimatedRemaining = estimateRemainingTime(state)

      return {
        planId: state.planId,
        completedSteps: state.completedSteps,
        totalSteps: state.totalSteps,
        failedSteps: state.failedSteps,
        percentage,
        totalTokensUsed: state.totalTokensUsed,
        totalTokensBudgeted: state.totalTokensBudgeted,
        totalTimeSpent: state.totalTimeSpent,
        estimatedRemaining,
        currentStep: Object.values(state.steps).find(s => s.status === 'in_progress')?.id || 'none',
        errors: state.errors,
      }
    },

    trackTokenUsage(tokens: number): void {
      state.totalTokensUsed += tokens
      updateTimestamp()
      console.log(`[ProgressTracker] Tokens used: ${state.totalTokensUsed} / ${state.totalTokensBudgeted}`)
    },
  }
}