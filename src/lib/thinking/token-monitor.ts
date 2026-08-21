/**
 * Layer 2.3: Token Monitoring
 *
 * Theo dõi và quản lý token budget cho mỗi workflow run.
 * Chỉ theo dõi và cảnh báo, không chặn hard-stop (NVIDIA NIM miễn phí).
 */

import type {
  Complexity,
  TokenUsageRecord,
  TokenMonitorState,
  TokenMonitorOptions,
} from './types'

// ==================== CONSTANTS ====================

/** Heuristic token budget theo loại task */
const TOKEN_BUDGETS: Record<string, number> = {
  think: 2000,
  explore: 4000,
  create: 6000,
  modify: 4000,
  verify: 2000,
  report: 6000,
}

/** Complexity multiplier */
const COMPLEXITY_MULTIPLIERS: Record<Complexity, number> = {
  simple: 1.0,
  medium: 1.5,
  complex: 2.0,
}

// ==================== MAIN FUNCTION ====================

/**
 * Tạo token monitor cho một workflow run.
 *
 * @param options - Cấu hình token monitor
 * @returns TokenMonitorState
 */
export function createTokenMonitor(options: TokenMonitorOptions = {}): TokenMonitorState {
  const {
    baseBudget = 6000,
    complexityMultiplier = 1.0,
    safetyMargin = 0.2,
  } = options

  const currentBudget = Math.round(baseBudget * complexityMultiplier * (1 + safetyMargin))

  return {
    currentBudget,
    usedSoFar: 0,
    remaining: currentBudget,
    history: [],
    warnings: [],
  }
}

// ==================== TRACKING FUNCTIONS ====================

/**
 * Ghi nhận token usage cho một task.
 *
 * @param monitor - Token monitor state
 * @param taskType - Loại task
 * @param complexity - Độ phức tạp
 * @param actualTokens - Số token thực tế sử dụng
 */
export function trackUsage(
  monitor: TokenMonitorState,
  taskType: string,
  complexity: Complexity,
  actualTokens: number,
): void {
  const budgeted = estimateBudget(taskType, complexity)

  const record: TokenUsageRecord = {
    taskType,
    complexity,
    budgeted,
    actual: actualTokens,
    timestamp: new Date(),
    overBudget: actualTokens > budgeted,
  }

  monitor.history.push(record)
  monitor.usedSoFar += actualTokens
  monitor.remaining = Math.max(0, monitor.currentBudget - monitor.usedSoFar)

  // Cảnh báo nếu vượt budget
  if (record.overBudget) {
    monitor.warnings.push(
      `⚠️ Task "${taskType}" vượt budget: ${actualTokens} > ${budgeted} tokens`
    )
  }

  // Cảnh báo nếu còn < 20% budget
  if (monitor.remaining < monitor.currentBudget * 0.2) {
    monitor.warnings.push(
      `⚠️ Còn ${monitor.remaining} tokens (${Math.round((monitor.remaining / monitor.currentBudget) * 100)}% budget còn lại)`
    )
  }
}

// ==================== QUERY FUNCTIONS ====================

/**
 * Lấy số token còn lại.
 */
export function getRemainingBudget(monitor: TokenMonitorState): number {
  return monitor.remaining
}

/**
 * Kiểm tra có vượt budget không.
 */
export function isOverBudget(monitor: TokenMonitorState): boolean {
  return monitor.usedSoFar > monitor.currentBudget
}

/**
 * Lấy cảnh báo.
 */
export function getWarnings(monitor: TokenMonitorState): string[] {
  return monitor.warnings
}

/**
 * Lấy lịch sử sử dụng token.
 */
export function getHistory(monitor: TokenMonitorState): TokenUsageRecord[] {
  return monitor.history
}

// ==================== REPORTING ====================

/**
 * Tạo báo cáo tổng kết token usage.
 *
 * @param monitor - Token monitor state
 * @returns Markdown report
 */
export function getReport(monitor: TokenMonitorState): string {
  const totalBudget = monitor.currentBudget
  const used = monitor.usedSoFar
  const remaining = monitor.remaining
  const usagePercent = totalBudget > 0 ? Math.round((used / totalBudget) * 100) : 0

  const lines: string[] = [
    `## 📊 Token Usage Report`,
    ``,
    `- **Total Budget**: ${totalBudget.toLocaleString()} tokens`,
    `- **Used**: ${used.toLocaleString()} tokens (${usagePercent}%)`,
    `- **Remaining**: ${remaining.toLocaleString()} tokens`,
    `- **Over Budget**: ${isOverBudget(monitor) ? '⚠️ YES' : '✅ No'}`,
    ``,
    `### History`,
  ]

  if (monitor.history.length === 0) {
    lines.push(`_No usage recorded yet._`)
  } else {
    for (const record of monitor.history) {
      const status = record.overBudget ? '🔴' : '🟢'
      lines.push(
        `- ${status} **${record.taskType}** (${record.complexity}): ` +
        `${record.actual.toLocaleString()} / ${record.budgeted.toLocaleString()} tokens`
      )
    }
  }

  if (monitor.warnings.length > 0) {
    lines.push(``, `### Warnings`)
    for (const warning of monitor.warnings) {
      lines.push(`- ${warning}`)
    }
  }

  return lines.join('\n')
}

// ==================== ESTIMATION ====================

/**
 * Ước lượng token budget cho một task.
 *
 * @param taskType - Loại task
 * @param complexity - Độ phức tạp
 * @returns Token budget ước lượng
 */
export function estimateBudget(taskType: string, complexity: Complexity): number {
  const baseBudget = TOKEN_BUDGETS[taskType] || 4000
  const multiplier = COMPLEXITY_MULTIPLIERS[complexity] || 1.0
  const safetyMargin = 1.2

  return Math.round(baseBudget * multiplier * safetyMargin)
}

/**
 * Tính tổng token budget cho nhiều tasks.
 *
 * @param tasks - Danh sách { taskType, complexity }
 * @returns Tổng token budget
 */
export function estimateTotalBudget(tasks: Array<{ taskType: string; complexity: Complexity }>): number {
  return tasks.reduce((total, task) => total + estimateBudget(task.taskType, task.complexity), 0)
}