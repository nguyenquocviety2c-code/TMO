/**
 * Layer 2: Thinking & Planning — Public API
 *
 * Export tất cả functions và types cho downstream consumers.
 */

// Types
export type {
  // Core types
  SubTask,
  SubTaskType,
  Complexity,
  DependencyGraph,
  DecompositionPlan,
  SolutionDesign,
  ArchitectureDecision,
  ComponentDesign,
  SchemaDesign,
  APIDesign,
  StateDesign,
  TokenUsageRecord,
  TokenMonitorState,
  // Workflow thinking context
  WorkflowThinkingContext,
  SubTaskSolutionMap,
  // Options
  DecomposerOptions,
  SolutionDesignerOptions,
  TokenMonitorOptions,
} from './types'

// Functions
export { decomposeTask } from './decomposer'
export { designSolution } from './solution-designer'
export {
  createTokenMonitor,
  trackUsage,
  getRemainingBudget,
  isOverBudget,
  getWarnings,
  getHistory,
  getReport,
  estimateBudget,
  estimateTotalBudget,
} from './token-monitor'

// Circular resolver
export { resolveCircularDependencies } from './circular-resolver'
