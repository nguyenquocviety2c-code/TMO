/**
 * Layer 2: Thinking & Planning — Shared Types
 *
 * Định nghĩa tất cả types/interfaces cho 3 quy trình:
 *   2.1 Problem Decomposition
 *   2.2 Solution Design
 *   2.3 Token Monitoring
 */

// ==================== 2.1 PROBLEM DECOMPOSITION ====================

/** Loại sub-task */
export type SubTaskType = 'frontend' | 'backend' | 'database' | 'config' | 'integration' | 'verify'

/** Độ phức tạp */
export type Complexity = 'simple' | 'medium' | 'complex'

/** Một sub-task đơn lẻ */
export interface SubTask {
  id: string                    // UUID
  name: string                  // Tên ngắn gọn
  type: SubTaskType             // Phân loại
  description: string           // Mô tả chi tiết
  goal: string                  // Mục tiêu rõ ràng
  expectedOutput: string        // Output xác định
  verificationCriteria: string  // Cách verify
  dependencies: string[]        // ID của sub-tasks phụ thuộc
  estimatedComplexity: Complexity
  estimatedTokens: number       // Token budget ước lượng
  filesToRead: string[]         // Files cần đọc
  filesToWrite: string[]        // Files cần viết/sửa
  risks: string[]               // Risks có thể gặp
  assignedAgent?: string        // Agent được assign (G1, G2-A, G2-B, G3)
}

/** Dependency graph */
export interface DependencyGraph {
  nodes: Map<string, SubTask>   // id → SubTask
  edges: Array<{ from: string; to: string }>  // from depends on to
  topologicalOrder: string[]    // Thứ tự thực thi (topological sort)
  parallelGroups: string[][]    // Nhóm có thể chạy song song
}

/** Kế hoạch phân rã hoàn chỉnh */
export interface DecompositionPlan {
  originalTask: string          // Task gốc từ user
  subTasks: SubTask[]           // Danh sách sub-tasks
  dependencyGraph: DependencyGraph
  totalEstimatedTokens: number
  totalEstimatedTime: number    // ms (ước lượng tổng thời gian)
  criticalPath: string[]        // Đường găng (critical path)
  risks: string[]               // Risks tổng thể
  /** Các sub-tasks bị merge do circular dependency */
  mergedSubTasks?: Array<{ originalIds: string[]; mergedId: string }>
  /** Warnings từ circular resolver */
  circularWarnings?: string[]
}

// ==================== 2.2 SOLUTION DESIGN ====================

/** Architecture decision */
export interface ArchitectureDecision {
  question: string              // "REST hay WebSocket?"
  options: string[]             // Các lựa chọn
  chosen: string                // Lựa chọn cuối cùng
  reasoning: string             // Lý do
  tradeoffs: string[]           // Trade-offs
}

/** Component design */
export interface ComponentDesign {
  name: string
  hierarchy: string[]           // Parent → Children chain
  props: Record<string, string> // propName → TypeScript type
  dataFlow: 'unidirectional' | 'bidirectional'
  events: string[]              // Event handlers
  stateNeeds: 'none' | 'local' | 'global' | 'server'
}

/** Schema design */
export interface SchemaDesign {
  models: Array<{
    name: string
    fields: Array<{ name: string; type: string; constraints: string[] }>
    relations: Array<{ to: string; type: '1-1' | '1-N' | 'N-M' }>
  }>
  indexes: string[]
  constraints: string[]
}

/** API design */
export interface APIDesign {
  endpoints: Array<{
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
    path: string
    description: string
    requestFormat?: string      // JSON schema hoặc mô tả
    responseFormat: string
    errorFormat: string
    authRequired: boolean
  }>
}

/** State design */
export interface StateDesign {
  stores: Array<{
    name: string
    type: 'local' | 'global' | 'server' | 'url'
    shape: Record<string, string>  // key → TypeScript type
    updateMethod: 'action' | 'mutation' | 'setter'
    syncMethod?: 'real-time' | 'polling' | 'none'
  }>
}

/** Solution design hoàn chỉnh */
export interface SolutionDesign {
  architectureDecisions: ArchitectureDecision[]
  componentDesigns: ComponentDesign[]
  schemaDesign?: SchemaDesign
  apiDesign?: APIDesign
  stateDesign?: StateDesign
  implementationNotes: string[]
}

// ==================== 2.3 TOKEN MONITORING ====================

/** Token usage record */
export interface TokenUsageRecord {
  taskType: string
  complexity: Complexity
  budgeted: number
  actual: number
  timestamp: Date
  overBudget: boolean
}

/** Token monitor state */
export interface TokenMonitorState {
  currentBudget: number
  usedSoFar: number
  remaining: number
  history: TokenUsageRecord[]
  warnings: string[]
}

// ==================== WORKFLOW THINKING CONTEXT ====================

/** Context trung tâm của Layer 2, truyền xuyên suốt pipeline */
export interface WorkflowThinkingContext {
  decompositionPlan: DecompositionPlan
  solutionDesigns: Map<string, SolutionDesign>  // subTaskId → SolutionDesign
  tokenMonitor: TokenMonitorState
  mentalModel: unknown  // MentalModel từ Layer 1 (cache để tránh gọi lại)
  createdAt: Date
}

/** Map từ subTaskId → SolutionDesign */
export type SubTaskSolutionMap = Map<string, SolutionDesign>

// ==================== OPTIONS ====================

export interface DecomposerOptions {
  useLLM?: boolean              // Mặc định: true
  maxSubTasks?: number          // Giới hạn số sub-tasks (default: 15)
  model?: string
}

export interface SolutionDesignerOptions {
  useLLM?: boolean
  model?: string
}

export interface TokenMonitorOptions {
  baseBudget?: number           // Mặc định: 6000
  complexityMultiplier?: number // Mặc định: 1.0
  safetyMargin?: number         // Mặc định: 0.2 (20%)
}