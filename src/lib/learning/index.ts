/**
 * Layer 9: Learning & Adaptation — Barrel Export
 *
 * Export tất cả public APIs của Layer 9.
 */

// Types
export type {
  ExecutionMetrics,
  AggregatedMetrics,
  FailurePattern,
  FailurePatternType,
  AdaptationStrategy,
  AdaptationRule,
  AdaptationDecision,
  LearningState,
  LearningConfig,
  MetricsCollector,
  StrategyAdaptationLog,
} from './types'

// Metrics Collector
export { createMetricsCollector } from './metrics-collector'

// Historical Feedback
export {
  analyzeHistoricalFeedback,
  getAdjustedBudget,
  getSuccessProbability,
} from './historical-feedback'

// Strategy Adapter
export {
  detectFailurePattern,
  recommendAdaptation,
  applyAdaptation,
  persistFailurePattern,
  persistAdaptationLog,
} from './strategy-adapter'