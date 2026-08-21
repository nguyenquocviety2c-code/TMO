/**
 * Layer 1: Intake & Comprehension — Public API
 *
 * Export tất cả public functions và types cho Layer 1.
 */

// Types
export type {
  TaskType,
  TechnicalConstraints,
  IntentResult,
  MentalModel,
  ProjectStructure,
  DependencyGraph,
  DetectedPattern,
  CodeConventions,
  SelectedFile,
  AssembledContext,
  Message,
  IntentParserOptions,
  CodeReaderOptions,
  AssemblyOptions,
} from './types'

// Intent Parsing (1.1)
export { parseIntent } from './intent-parser'

// Code Reading (1.2)
export { buildMentalModel, invalidateMentalModelCache } from './code-reader'

// Context Assembly (1.3)
export { assembleContext } from './context-assembler'