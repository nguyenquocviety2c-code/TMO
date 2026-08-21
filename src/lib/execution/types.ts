/**
 * Layer 3: Execution — Shared Types
 *
 * Định nghĩa tất cả types/interfaces cho 3 quy trình:
 *   3.1 Step Routing
 *   3.2 Code Generation
 *   3.3 File Operations
 */

import type { SubTask, SubTaskType, SolutionDesign, ComponentDesign, APIDesign, SchemaDesign } from '@/lib/thinking'
import type { MentalModel, AssembledContext } from '@/lib/intake'

// ==================== 3.1 STEP ROUTING ====================

/** Loại executor — ánh xạ 1:1 với SubTaskType từ Layer 2 */
export type ExecutorType = 'analyze' | 'create' | 'modify' | 'database' | 'api' | 'ui' | 'verify'

/** Routing decision cho một sub-task */
export interface RoutingDecision {
  subTaskId: string
  executor: ExecutorType
  toolsNeeded: string[]          // e.g. ['read', 'write', 'bash']
  agentPosition: string          // TL | G1 | G2-A | G2-B | G3
  reasoning: string
}

/** Routing table entry — static mapping */
export interface RoutingTableEntry {
  taskType: SubTaskType          // từ Layer 2
  executor: ExecutorType
  tools: string[]
  typicalOutput: string
}

// ==================== 3.2 CODE GENERATION ====================

/** Kết quả sinh code */
export interface CodeGenResult {
  subTaskId: string
  files: GeneratedFile[]
  success: boolean
  errors: string[]
  tokensUsed: number
}

/** File được sinh ra */
export interface GeneratedFile {
  path: string
  content: string
  operation: 'create' | 'modify'
  language: string               // 'typescript' | 'tsx' | 'prisma' | ...
}

/** Options cho code generator */
export interface CodeGenOptions {
  followConventions: boolean     // default: true
  typeSafe: boolean              // default: true
  incremental: boolean           // default: true
  model?: string
}

// ==================== 3.3 FILE OPERATIONS ====================

/** Kết quả thao tác file */
export interface FileOperationResult {
  path: string
  operation: 'read' | 'write' | 'edit' | 'multiEdit' | 'delete'
  success: boolean
  error?: string
  backupPath?: string            // Nếu có backup trước khi sửa
}

/** Một edit operation đơn lẻ */
export interface EditOperation {
  search: string
  replace: string
}

/** Options cho file operator */
export interface FileOperatorOptions {
  surgicalEdit: boolean          // default: true — chỉ sửa phần cần thiết
  atomicOperation: boolean       // default: true — mỗi edit là 1 thay đ中的一处thay đổi hoàn chỉnh
  createBackup: boolean          // default: false — backup trước refactor lớn
}

// ==================== EXECUTION CONTEXT ====================

/** Context trung tâm của Layer 3, nhận từ Layer 2 */
export interface ExecutionContext {
  subTask: SubTask               // Từ Layer 2
  solutionDesign: SolutionDesign // Từ Layer 2
  routing?: RoutingDecision      // OPTIONAL — được gán sau khi routeStep() chạy
  mentalModel: MentalModel       // Từ Layer 1 (cache)
  assembledContext: AssembledContext // Từ Layer 1
}

// ==================== OPTIONS ====================

export interface StepRouterOptions {
  fallbackExecutor?: ExecutorType // Mặc định: 'modify'
  allowAgentOverride?: boolean    // Cho phép assignedAgent override agent mặc định
}

export interface FileOperatorConfig {
  surgicalEdit?: boolean
  atomicOperation?: boolean
  createBackup?: boolean
  backupDir?: string             // Thư mục lưu backup (default: .execution-backups)
}
