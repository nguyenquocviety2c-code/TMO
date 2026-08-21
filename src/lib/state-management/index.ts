/**
 * Layer 6: State Management System — Barrel Export
 *
 * Export tất cả types, interfaces, và factory functions
 * để các module khác import dễ dàng.
 */

// ==================== TYPES ====================

export type {
  // Progress Tracking
  ProgressState,
  StepState,
  StepResult,
  ProgressReport,
  ProgressTracker,

  // Context Management
  ContextState,
  ContextEntry,
  SummarizationResult,
  PruneStrategy,
  ProgressiveContext,
  ContextManager,

  // Checkpoint & Recovery
  Checkpoint,
  CheckpointState,
  CheckpointPhase,
  CheckpointManager,

  // Pipeline Context
  PipelineContext,
} from './types'

// ==================== FACTORY FUNCTIONS ====================

export { createProgressTracker } from './progress-tracker'
export { createContextManager } from './context-manager'
export { createCheckpointManager } from './checkpoint-manager'