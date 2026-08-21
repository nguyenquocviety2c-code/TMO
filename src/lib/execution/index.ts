/**
 * Layer 3: Execution — Public API
 *
 * Export tất cả functions và types cho downstream consumers.
 */

// Types
export type {
  // Core types
  ExecutorType,
  RoutingDecision,
  RoutingTableEntry,
  CodeGenResult,
  GeneratedFile,
  CodeGenOptions,
  FileOperationResult,
  EditOperation,
  FileOperatorOptions,
  FileOperatorConfig,
  ExecutionContext,
  StepRouterOptions,
} from './types'

// Step Router (3.1)
export {
  routeStep,
  routeSteps,
  getRoutingTable,
  resolveTools,
  isTaskTypeSupported,
} from './step-router'

// Code Generator (3.2)
export {
  generateCode,
  generateComponent,
  generateApiRoute,
  generateSchemaCode,
  validateCodeConsistency,
} from './code-generator'

// File Operator (3.3)
export {
  readFile,
  writeFile,
  editFile,
  multiEditFile,
  safeWriteFile,
  verifyFileExists,
  deleteFile,
  listDirectory,
} from './file-operator'