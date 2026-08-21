/**
 * Layer 8: Communication System — Public API
 *
 * Export tất cả types và factory functions cho:
 *   - Progress Reporter (8.1)
 *   - Clarification Engine (8.2)
 *
 * Usage:
 *   import { createProgressReporter, createClarificationEngine } from '@/lib/communication'
 */

// ==================== TYPES ====================

export type {
  // Configuration
  CommunicationConfig,
  ReportFormat,
  ReportLanguage,

  // Progress Reporter
  ProgressReporter,
  ProgressReportInput,
  StepProgressInput,
  WorklogStats,

  // Clarification Engine
  ClarificationEngine,
  ClarificationGap,
  clarificationGapType,
  ClarificationDecision,
  ClarificationRequest,
  ClarificationResponse,
  ClarificationContext,

  // Communication State
  CommunicationState,

  // SSE Events
  ExtendedWorkflowEventType,
  ClarificationNeededPayload,
  ClarificationResolvedPayload,
  ClarificationTimeoutPayload,
  ProgressReportPayload,
  FinalReportPayload,

  // Workflow Pause/Resume
  PausedWorkflowState,
  WorkflowResumeContext,
} from './types'

// ==================== FACTORIES ====================

export { createProgressReporter } from './progress-reporter'
export { createClarificationEngine } from './clarification-engine'