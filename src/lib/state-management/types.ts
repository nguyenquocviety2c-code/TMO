/**
 * Layer 6: State Management System — Types
 *
 * Định nghĩa tất cả TypeScript interfaces cho:
 *   - Progress Tracking (6.1)
 *   - Context Management (6.2)
 *   - Checkpoint & Recovery (6.3)
 */

import type { ErrorRecord } from '@/lib/error-handling'
import type { PipelineStep, AgentPosition, StepType, StepStatus } from '@/lib/code-team/types'
import type { DecompositionPlan } from '@/lib/thinking'
import type { RoutingDecision, WorklogEntry } from '@/lib/code-team/worklog'
import type { CommunicationState } from '@/lib/communication'

// ==================== PROGRESS TRACKING (6.1) ====================

/** Trạng thái tiến độ của toàn bộ workflow */
export interface ProgressState {
  planId: string
  totalSteps: number
  completedSteps: number
  failedSteps: number
  currentStep: number
  steps: Record<string, StepState>  // FIX #1: Record thay vì Map (serialize được qua JSON)
  totalTokensUsed: number
  totalTokensBudgeted: number
  totalTimeSpent: number
  errors: ErrorRecord[]  // FIX #4: Import từ @/lib/error-handling
  startedAt: string      // FIX #1: ISO string thay vì Date (serialize được)
  lastUpdatedAt: string
}

/** Trạng thái của một step đơn lẻ */
export interface StepState {
  id: string
  type: StepType          // FIX #8: Import từ code-team/types
  status: StepStatus      // FIX #11: Import từ code-team/types
  agentPosition: AgentPosition
  description: string
  result?: StepResult
  tokensUsed?: number
  tokensBudgeted?: number
  timeSpent?: number
  errors?: ErrorRecord[]
  startedAt?: string
  completedAt?: string
}

/** Kết quả của một step sau khi hoàn thành */
export interface StepResult {
  success: boolean
  filesCreated: string[]
  filesModified: string[]
  summary: string
  outputForNext: string
}

/** Báo cáo tiến độ tổng hợp */
export interface ProgressReport {  // FIX #9: Định nghĩa đầy đủ
  planId: string
  completedSteps: number
  totalSteps: number
  failedSteps: number
  percentage: number
  totalTokensUsed: number
  totalTokensBudgeted: number
  totalTimeSpent: number
  estimatedRemaining: string
  currentStep: string
  errors: ErrorRecord[]
}

/** Interface cho Progress Tracker */
export interface ProgressTracker {  // FIX #10: Định nghĩa interface
  getState(): ProgressState
  updateStepStatus(stepId: string, status: StepStatus): void
  recordStepResult(stepId: string, result: StepResult): void
  getProgressReport(): ProgressReport
  trackTokenUsage(tokens: number): void
}

// ==================== CONTEXT MANAGEMENT (6.2) ====================

/** Chiến lược prune context */
export type PruneStrategy = 'summarize_old' | 'drop_low_priority' | 'write_to_worklog'  // FIX #7

/** Trạng thái context hiện tại */
export interface ContextState {  // FIX #2: Tách khỏi ContextManager
  maxTokens: number
  currentTokens: number
  entries: ContextEntry[]
  summarizationCache: Record<string, SummarizationResult>
  priorityScores: Record<string, number>
}

/** Một entry trong context */
export interface ContextEntry {
  id: string
  type: 'spec' | 'worklog' | 'code' | 'error' | 'decision'
  content: string
  tokenCount: number
  timestamp: string
  priority: number
  source: string
}

/** Kết quả tóm tắt một step */
export interface SummarizationResult {
  originalTokens: number
  summaryTokens: number
  compressionRatio: number
  summary: string
  keyDecisions: string[]
  keyResults: string[]
}

/** Context được build cho một step tiếp theo */
export interface ProgressiveContext {  // FIX #6: Định nghĩa
  systemPrompt: string
  userPrompt: string
  relevantWorklogs: WorklogEntry[]
  relevantCodeFiles: string[]
  tokenCount: number
}

/** Interface cho Context Manager */
export interface ContextManager {  // FIX #2: Interface cho đối tượng manager
  getState(): ContextState
  summarizeStep(stepResult: StepResult): SummarizationResult
  prioritizeContext(entries: ContextEntry[], currentStep: string): ContextEntry[]
  shouldPruneContext(): boolean
  pruneContext(strategy: PruneStrategy): void
  buildProgressiveContext(step: PipelineStep): ProgressiveContext
  writeContextToWorklog(sessionId: string): Promise<void>
}

// ==================== CHECKPOINT & RECOVERY (6.3) ====================

/** Phase của checkpoint */
export type CheckpointPhase =
  | 'after_intake'
  | 'after_tl_analyze'
  | 'after_g1_design'
  | 'after_g2a_code'
  | 'after_g2b_review'
  | 'after_g3_optimize'
  | 'before_risky_change'

/** Checkpoint đã lưu */
export interface Checkpoint {
  id: string
  sessionId: string
  timestamp: string
  phase: CheckpointPhase
  completedSteps: string[]
  currentStepIndex: number
  filesModified: string[]
  keyDecisions: string[]
  pendingIssues: string[]
  progressSnapshot: string    // FIX #3: JSON string, không phải object
  contextSnapshot: string     // JSON string
  routingDecision: string     // JSON string
}

/** State đầy đủ để restore từ checkpoint */
export interface CheckpointState {
  progress: ProgressState
  context: ContextEntry[]
  routing: RoutingDecision
  spec: string
  pipeline: PipelineStep[]
  currentStepIndex: number
}

/** Interface cho Checkpoint Manager */
export interface CheckpointManager {  // FIX #10: Định nghĩa interface
  shouldCreateCheckpoint(step: PipelineStep, progress: ProgressState): boolean
  saveCheckpoint(state: CheckpointState): Promise<Checkpoint>
  restoreCheckpoint(checkpointId: string): Promise<CheckpointState>
  listCheckpoints(): Promise<Checkpoint[]>
  getLatestCheckpoint(): Promise<Checkpoint | null>
}

// ==================== PIPELINE CONTEXT (FIX #17) ====================

/** Context object cho runPipeline() — thay thế 8+ tham số riêng lẻ */
export interface PipelineContext {
  routingDecision: RoutingDecision
  sessionId: string
  userRequest: string
  emit: (event: unknown) => void
  workflowStartTime: number
  isAborted: () => boolean
  ctx: unknown  // WorkflowContext — tránh circular dependency
  thinkingContext?: unknown
  // Layer 6 additions:
  progressTracker: ProgressTracker
  contextManager: ContextManager
  checkpointManager: CheckpointManager
  // Layer 7 additions:
  orchestrator?: unknown  // MasterOrchestrator instance
  toolSelector?: unknown   // ToolSelector instance
  agentDelegator?: unknown // AgentDelegator instance
  // Layer 8 additions:
  communicationState?: CommunicationState
}

// ==================== ORCHESTRATION STATE (Layer 7) ====================
// Single Source of Truth: src/lib/orchestration/types.ts
// Re-export để giữ backward compatibility

export type {
  OrchestrationState,
  OrchestrationDecision,
  OrchestrationConfig,
  OrchestrationRequest,
  OrchestrationResult,
} from '@/lib/orchestration'
