/**
 * Layer 9.1: Historical Feedback
 *
 * Phân tích lịch sử execution metrics để:
 *   1. Điều chỉnh token budget cho các task tương tự trong tương lai
 *   2. Ước tính xác suất thành công dựa trên historical data
 *   3. Tổng hợp aggregated metrics từ nhiều workflow runs
 */

import { db } from '@/lib/db'
import type { AggregatedMetrics, ExecutionMetrics } from './types'

/**
 * Phân tích tất cả ExecutionMetrics từ DB để tạo AggregatedMetrics
 */
export async function analyzeHistoricalFeedback(): Promise<AggregatedMetrics> {
  const allMetrics = await db.executionMetrics.findMany()

  const byTaskType: AggregatedMetrics['byTaskType'] = {}
  const byRoutingMode: AggregatedMetrics['byRoutingMode'] = {}
  const byErrorType: Record<string, number> = {}

  let totalCompletedSteps = 0
  let totalFailedSteps = 0
  let totalSteps = 0

  for (const metric of allMetrics) {
    // Group by routingMode (used as proxy for task type complexity)
    const mode = metric.routingMode
    if (!byRoutingMode[mode]) {
      byRoutingMode[mode] = {
        avgTokensUsed: 0,
        avgTokensBudgeted: 0,
        avgTimeSpent: 0,
        successRate: 0,
        sampleSize: 0,
      }
    }

    const modeStats = byRoutingMode[mode]
    modeStats.avgTokensUsed =
      (modeStats.avgTokensUsed * modeStats.sampleSize + metric.totalTokensUsed) /
      (modeStats.sampleSize + 1)
    modeStats.avgTokensBudgeted =
      (modeStats.avgTokensBudgeted * modeStats.sampleSize + metric.totalTokensBudgeted) /
      (modeStats.sampleSize + 1)
    modeStats.avgTimeSpent =
      (modeStats.avgTimeSpent * modeStats.sampleSize + metric.totalTimeSpent) /
      (modeStats.sampleSize + 1)
    modeStats.successRate =
      (modeStats.successRate * modeStats.sampleSize + metric.stepSuccessRate) /
      (modeStats.sampleSize + 1)
    modeStats.sampleSize++

    // Aggregate error types
    try {
      const errors = JSON.parse(metric.errorsByType) as Record<string, number>
      for (const [errorType, count] of Object.entries(errors)) {
        byErrorType[errorType] = (byErrorType[errorType] || 0) + count
      }
    } catch {
      // Ignore parse errors
    }

    totalCompletedSteps += metric.completedSteps
    totalFailedSteps += metric.failedSteps
    totalSteps += metric.totalSteps
  }

  const overallSuccessRate = totalSteps > 0 ? totalCompletedSteps / totalSteps : 0

  return {
    byTaskType,
    byRoutingMode,
    byErrorType,
    overallSuccessRate,
    totalRuns: allMetrics.length,
  }
}

/**
 * Tính toán adjusted budget dựa trên historical data
 */
export function getAdjustedBudget(
  taskType: string,
  complexity: number,
  historicalMetrics: AggregatedMetrics | null,
  baseBudget: number,
  minRunsForFeedback: number = 5
): number {
  // Default: use base budget with complexity multiplier
  let adjustedBudget = baseBudget * complexity

  // If we have historical data for this task type
  if (historicalMetrics?.byTaskType[taskType]) {
    const taskStats = historicalMetrics.byTaskType[taskType]

    // Need minimum sample size for reliable feedback
    if (taskStats.sampleSize >= minRunsForFeedback) {
      // Add 10% buffer to historical average
      adjustedBudget = taskStats.avgTokensUsed * 1.1 * complexity
    }
  }

  return Math.round(adjustedBudget)
}

/**
 * Ước tính xác suất thành công dựa trên historical data
 */
export function getSuccessProbability(
  taskType: string,
  routingMode: string,
  historicalMetrics: AggregatedMetrics | null
): number {
  if (!historicalMetrics) {
    return 0.5 // Neutral when no data
  }

  // Check specific (taskType, routingMode) combination
  if (historicalMetrics.byTaskType[taskType]) {
    return historicalMetrics.byTaskType[taskType].successRate
  }

  // Fall back to routingMode average
  if (historicalMetrics.byRoutingMode[routingMode]) {
    return historicalMetrics.byRoutingMode[routingMode].successRate
  }

  // Fall back to overall average
  if (historicalMetrics.totalRuns > 0) {
    return historicalMetrics.overallSuccessRate
  }

  return 0.5 // Neutral when no specific data
}