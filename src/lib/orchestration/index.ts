/**
 * Layer 7: Orchestration System — Public API
 *
 * Export tất cả các hàm và types cho Layer 7: Điều Phối.
 *
 * Usage:
 *   import { createMasterOrchestrator, createToolSelector, createAgentDelegator } from '@/lib/orchestration'
 *   import type { OrchestrationConfig, ToolSelector, AgentDelegator } from '@/lib/orchestration'
 */

// ==================== FACTORY FUNCTIONS ====================

export { createMasterOrchestrator } from './master-orchestrator'
export { createToolSelector } from './tool-selector'
export { createAgentDelegator } from './agent-delegator'

// ==================== TYPES ====================

export type {
  // Master Orchestration (7.1)
  OrchestrationState,
  OrchestrationPhase,
  OrchestrationDecision,
  OrchestrationConfig,
  MasterOrchestrator,
  OrchestrationRequest,
  OrchestrationResult,
  DecisionPoint,
  DecisionContext,

  // Tool Selection (7.2)
  ToolSelectionRequest,
  ToolSelectionResult,
  ToolCapability,
  ToolSelector,

  // Agent Delegation (7.3)
  DelegatedTask,
  DelegatedTaskResult,
  DelegationDecision,
  DelegationRequest,
  AgentDelegator,
} from './types'

// Re-export shared types from orchestration types (single source of truth)
export type {
  OrchestrationMode,
  DelegationStrategy,
  ToolCategory,
} from './types'
