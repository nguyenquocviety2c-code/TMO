/**
 * Code Team — Shared Types
 *
 * Tách từ workflow-engine.ts để tránh circular dependency
 * giữa state-management và code-team modules.
 *
 * Các types này được sử dụng bởi:
 *   - workflow-engine.ts (pipeline definitions)
 *   - worklog.ts (context building)
 *   - state-management/* (progress tracking, checkpoint)
 *   - orchestration/* (Layer 7: tool selection, agent delegation)
 */

// ==================== AGENT POSITIONS ====================

/** Agent position trong pipeline */
export type AgentPosition = 'TL' | 'G1' | 'G2-A' | 'G2-B' | 'G3'

// ==================== STEP TYPES ====================

/** Các bước trong pipeline */
export type StepType = 'analyze' | 'design' | 'code' | 'review' | 'optimize' | 'verify' | 'routing'

/** Trạng thái của một step */
export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped'

// ==================== PIPELINE STEP ====================

/** Pipeline step definition */
export interface PipelineStep {
  position: AgentPosition
  step: StepType
  isCheckpoint: boolean // TL verify after this step?
  description: string
}

// ==================== ORCHESTRATION TYPES (Layer 7) ====================

/** Chế độ điều phối */
export type OrchestrationMode = 'sequential' | 'parallel' | 'hybrid' | 'adaptive'

/** Chiến lược delegation */
export type DelegationStrategy = 'none' | 'single_agent' | 'multi_agent' | 'smolab'

/** Phân loại tool */
export type ToolCategory = 'read' | 'write' | 'search' | 'execute' | 'browser' | 'image' | 'knowledge' | 'skill'
