/**
 * Layer 6.2: Context Management
 *
 * Quản lý context window: summarization, prioritization, worklog, progressive loading.
 * Được khởi tạo với maxTokens và cập nhật sau mỗi step.
 */

import type {
  ContextManager,
  ContextState,
  ContextEntry,
  SummarizationResult,
  PruneStrategy,
  ProgressiveContext,
  StepResult,
} from './types'
import type { PipelineStep } from '@/lib/code-team/types'

// ==================== CONSTANTS ====================

/** Default max tokens cho context window */
const DEFAULT_MAX_TOKENS = 100_000

/** Ngưỡng prune context (80% capacity) */
const PRUNE_THRESHOLD = 0.8

/** Ngưỡng critical prune (90% capacity) */
const CRITICAL_THRESHOLD = 0.9

/** Số lượng entries tối đa trong summarization cache */
const MAX_CACHE_SIZE = 100

// ==================== HELPER FUNCTIONS ====================

/**
 * Ước tính số tokens từ text.
 * ~4 chars per token cho English/Vietnamese.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Extract key decisions từ text bằng regex.
 */
function extractKeyDecisions(text: string): string[] {
  const patterns = [
    /(?:Decision|Quyết định)[:\s]+(.+)/gi,
    /(?:Decided|Đã quyết định)[:\s]+(.+)/gi,
  ]
  const results: string[] = []
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      results.push(match[1].trim())
    }
  }
  return results.slice(0, 5) // Tối đa 5 decisions
}

/**
 * Extract key churn từ text bằng regex.
 */
function extractKeyResults(text: string): string[] {
  const patterns = [
    /(?:Result|Kết quả)[:\s]+(.+)/gi,
    /(?:Completed|Hoàn thành)[:\s]+(.+)/gi,
    /(?:Created|Tạo)[:\s]+(.+)/gi,
  ]
  const results: string[] = []
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      results.push(match[1].trim())
    }
  }
  return results.slice(0, 5) // Tối đa 5 results
}

/**
 * Tính priority score cho một entry dựa trên type và age.
 */
function calculatePriority(entry: ContextEntry, currentStep: string): number {
  let score = entry.priority

  // Boost priority cho entries liên quan đến current step
  if (entry.source === currentStep) {
    score += 10
  }

  // Giảm priority cho entries cũ
  const age = Date.now() - new Date(entry.timestamp).getTime()
  const ageHours = age / (1000 * 60 * 60)
  score -= ageHours * 0.5 // Giảm 0.5 điểm mỗi giờ

  return Math.max(0, score)
}

// ==================== FACTORY ====================

/**
 * Tạo ContextManager với maxTokens.
 *
 * @param maxTokens - Giới hạn token cho context window
 * @returns ContextManager instance
 */
export function createContextManager(maxTokens: number = DEFAULT_MAX_TOKENS): ContextManager {
  const state: ContextState = {
    maxTokens,
    currentTokens: 0,
    entries: [],
    summarizationCache: {},
    priorityScores: {},
  }

  // ==================== INTERNAL METHODS ====================

  function updateTokenCount(): void {
    state.currentTokens = state.entries.reduce((sum, e) => sum + e.tokenCount, 0)
  }

  function addToCache(key: string, result: SummarizationResult): void {
    const keys = Object.keys(state.summarizationCache)
    if (keys.length >= MAX_CACHE_SIZE) {
      // Xóa entry cũ nhất (FIFO)
      delete state.summarizationCache[keys[0]]
    }
    state.summarizationCache[key] = result
  }

  // ==================== PUBLIC API ====================

  return {
    getState(): ContextState {
      return JSON.parse(JSON.stringify(state)) // Deep clone
    },

    summarizeStep(stepResult: StepResult): SummarizationResult {
      const originalText = stepResult.summary
      const originalTokens = estimateTokens(originalText)

      // Light mode: Truncate + regex extract (không cần LLM)
      const summary = originalText.slice(0, 300)
      const keyDecisions = extractKeyDecisions(originalText)
      const keyResults = extractKeyResults(originalText)

      const summaryTokens = estimateTokens(summary)
      const result: SummarizationResult = {
        originalTokens,
        summaryTokens,
        compressionRatio: originalTokens / Math.max(summaryTokens, 1),
        summary,
        keyDecisions,
        keyResults,
      }

      // Cache kết quả
      const cacheKey = `step-${Date.now()}`
      addToCache(cacheKey, result)

      console.log(
        `[ContextManager] Summarized: ${originalTokens} → ${summaryTokens} tokens (ratio: ${result.compressionRatio.toFixed(2)}x)`
      )

      return result
    },

    prioritizeContext(entries: ContextEntry[], currentStep: string): ContextEntry[] {
      return [...entries]
        .map(entry => ({
          ...entry,
          priority: calculatePriority(entry, currentStep),
        }))
        .sort((a, b) => b.priority - a.priority)
    },

    shouldPruneContext(): boolean {
      return state.currentTokens > state.maxTokens * PRUNE_THRESHOLD
    },

    pruneContext(strategy: PruneStrategy): void {
      console.log(`[ContextManager] Pruning context with strategy: ${strategy}`)

      switch (strategy) {
        case 'summarize_old': {
          // Tìm entries cũ nhất (> 5 steps ago), summarize thay vì xóa
          const cutoff = Date.now() - 5 * 60 * 60 * 1000 // 5 giờ
          const oldEntries = state.entries.filter(e => new Date(e.timestamp).getTime() < cutoff)

          for (const entry of oldEntries) {
            const summary = entry.content.slice(0, 150)
            entry.content = `[SUMMARIZED] ${summary}...`
            entry.tokenCount = estimateTokens(entry.content)
          }
          break
        }

        case 'drop_low_priority': {
          // Sắp xếp theo priority, xóa 20% thấp nhất
          const sorted = [...state.entries].sort((a, b) => a.priority - b.priority)
          const toRemove = Math.ceil(sorted.length * 0.2)
          state.entries = sorted.slice(toRemove)
          break
        }

        case 'write_to_worklog': {
          // Ghi entries ra worklog DB, xóa khỏi memory
          // (Implementation sẽ gọi writeContextToWorklog)
          state.entries = state.entries.filter(e => e.type === 'spec') // Giữ lại spec
          break
        }
      }

      updateTokenCount()
      console.log(`[ContextManager] After prune: ${state.currentTokens}/${state.maxTokens} tokens`)
    },

    buildProgressiveContext(step: PipelineStep): ProgressiveContext {
      // Lọc entries liên quan đến step hiện tại
      const relevantEntries = state.entries.filter(e => {
        // Luôn include spec
        if (e.type === 'spec') return true
        // Include worklog từ cùng position
        if (e.type === 'worklog' && e.source === step.position) return true
        // Include code liên quan
        if (e.type === 'code') return true
        return false
      })

      // Tính tổng tokens
      const tokenCount = relevantEntries.reduce((sum, e) => sum + e.tokenCount, 0)

      // Build prompts
      const systemPrompt = relevantEntries
        .filter(e => e.type === 'spec')
        .map(e => e.content)
        .join('\n\n')

      const userPrompt = relevantEntries
        .filter(e => e.type !== 'spec')
        .map(e => e.content)
        .join('\n\n')

      return {
        systemPrompt,
        userPrompt,
        relevantWorklogs: [], // TODO: Convert từ entries
        relevantCodeFiles: [], // TODO: Extract từ code entries
        tokenCount,
      }
    },

    async writeContextToWorklog(sessionId: string): Promise<void> {
      // TODO: Implement sau khi có DB access
      // Ghi context entries ra CodeTeamWorklog.contextSnapshot
      console.log(`[ContextManager] Writing context to worklog for session ${sessionId}`)
      // const { db } = await import('@/lib/db')
      // await db.codeTeamWorklog.updateMany({
      //   where: { sessionId },
      //   data: { contextSnapshot: JSON.stringify(state.entries) }
      // })
    },
  }
}