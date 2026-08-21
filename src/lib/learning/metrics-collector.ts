/**
 * Layer 9.1: Metrics Collector
 *
 * Thu thập metrics real-time trong lúc workflow execution.
 * Duy trì in-memory ExecutionMetrics object, flush vào DB khi workflow kết thúc.
 *
 * Fire-and-forget pattern: lỗi khi flush không được làm crash orchestrator.
 */

import { db } from '@/lib/db'
import type { ErrorRecord } from '@/lib/error-handling'
import type { ExecutionMetrics, MetricsCollector as IMetricsCollector } from './types'

interface StepRecord {
  stepId: string
  stepType: string
  agentPosition: string
  startedAt: number
  tokensUsed: number
  timeSpent: number
  errors: Array<{ type: string; message: string }>
  result?: {
    success: boolean
    filesCreated: string[]
    filesModified: string[]
    summary: string
    outputForNext: string
  }
}

export function createMetricsCollector(
  sessionId: string,
  planId: string,
  routingMode: string,
  tier: number,
  totalTokensBudgeted: number
): IMetricsCollector {
  const steps = new Map<string, StepRecord>()
  let totalTokensUsed = 0
  const startTime = Date.now()

  return {
    recordStepStart(stepId: string, stepType: string, agentPosition: string): void {
      steps.set(stepId, {
        stepId,
        stepType,
        agentPosition,
        startedAt: Date.now(),
        tokensUsed: 0,
        timeSpent: 0,
        errors: [],
      })
    },

    recordStepComplete(
      stepId: string,
      result: {
        success: boolean
        filesCreated: string[]
        filesModified: string[]
        summary: string
        outputForNext: string
      },
      tokensUsed: number,
      timeSpent: number
    ): void {
      const step = steps.get(stepId)
      if (!step) return

      step.result = result
      step.tokensUsed = tokensUsed
      step.timeSpent = timeSpent
      // Step tokens count toward the session total (callers do not call recordTokenUsage separately)
      totalTokensUsed += tokensUsed
    },

    recordStepError(stepId: string, error: ErrorRecord): void {
      const step = steps.get(stepId)
      if (!step) return

      step.errors.push({ type: error.errorType, message: error.message })
    },

    recordTokenUsage(tokens: number): void {
      totalTokensUsed += tokens
    },

    getCurrentMetrics(): ExecutionMetrics {
      const completedSteps = Array.from(steps.values()).filter((s) => s.result !== undefined).length
      const failedSteps = Array.from(steps.values()).filter((s) => s.result && !s.result.success).length
      const totalSteps = steps.size

      const errorsByType: Record<string, number> = {}
      for (const step of steps.values()) {
        for (const error of step.errors) {
          errorsByType[error.type] = (errorsByType[error.type] || 0) + 1
        }
      }

      const stepSuccessRate = totalSteps > 0 ? (totalSteps - failedSteps) / totalSteps : 0
      const tokenEfficiency = totalTokensBudgeted > 0 ? totalTokensUsed / totalTokensBudgeted : 0

      return {
        id: `metrics-${sessionId}-${Date.now()}`,
        sessionId,
        planId,
        routingMode,
        tier,
        totalSteps,
        completedSteps,
        failedSteps,
        totalTokensUsed,
        totalTokensBudgeted,
        totalTimeSpent: Date.now() - startTime,
        errorsByType,
        stepSuccessRate,
        tokenEfficiency,
        createdAt: new Date().toISOString(),
      }
    },

    async flush(): Promise<ExecutionMetrics> {
      const metrics = this.getCurrentMetrics()

      try {
        await db.executionMetrics.create({
          data: {
            id: metrics.id,
            sessionId: metrics.sessionId,
            planId: metrics.planId,
            routingMode: metrics.routingMode,
            tier: metrics.tier,
            totalSteps: metrics.totalSteps,
            completedSteps: metrics.completedSteps,
            failedSteps: metrics.failedSteps,
            totalTokensUsed: metrics.totalTokensUsed,
            totalTokensBudgeted: metrics.totalTokensBudgeted,
            totalTimeSpent: metrics.totalTimeSpent,
            errorsByType: JSON.stringify(metrics.errorsByType),
            stepSuccessRate: metrics.stepSuccessRate,
            tokenEfficiency: metrics.tokenEfficiency,
            createdAt: new Date(metrics.createdAt),
          },
        })
      } catch (err) {
        // Fire-and-forget: log error but don't crash
        console.error('[MetricsCollector] Failed to flush metrics:', err)
      }

      return metrics
    },
  }
}