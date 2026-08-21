/**
 * Layer 3.1: Step Routing
 *
 * Mỗi loại task cần executor khác nhau với tools khác nhau.
 * Route sai executor = thực thi sai cách.
 *
 * Quy tắc routing:
 *   1. Một step chỉ có 1 primary executor
 *   2. Executor có thể gọi tools từ executor khác nếu cần
 *   3. Complex steps có thể cần multiple executors (sequential)
 *   4. Routing decision phải xét: task type + dependencies + available tools
 */

import type { SubTask, SubTaskType } from '@/lib/thinking'
import type {
  ExecutorType,
  RoutingDecision,
  RoutingTableEntry,
  StepRouterOptions,
} from './types'

// ==================== STATIC ROUTING TABLE ====================

/**
 * Bảng routing tĩnh — ánh xạ SubTaskType → Executor + Tools + Agent
 *
 * | SubTaskType | Executor | Tools              | Agent     |
 * |-------------|----------|--------------------|-----------|
 * | frontend    | ui       | Write, Read, Bash  | G2-A      |
 * | backend     | api      | Write, Read, Bash  | G2-A      |
 * | database    | database | Write, Read, Bash  | G1        |
 * | config      | create   | Write, Read        | G2-A      |
 * | integration | modify   | Read, Edit, Multi  | G2-B      |
 * | verify      | verify   | Read, Bash, Browser| TL        |
 */
const ROUTING_TABLE: RoutingTableEntry[] = [
  {
    taskType: 'frontend',
    executor: 'ui',
    tools: ['write', 'read', 'bash'],
    typicalOutput: 'UI components, pages, styling',
  },
  {
    taskType: 'backend',
    executor: 'api',
    tools: ['write', 'read', 'bash'],
    typicalOutput: 'API routes, server logic',
  },
  {
    taskType: 'database',
    executor: 'database',
    tools: ['write', 'read', 'bash'],
    typicalOutput: 'Schema, migrations, queries',
  },
  {
    taskType: 'config',
    executor: 'create',
    tools: ['write', 'read'],
    typicalOutput: 'Configuration files, setup',
  },
  {
    taskType: 'integration',
    executor: 'modify',
    tools: ['read', 'edit', 'multiEdit'],
    typicalOutput: 'Modified files connecting components',
  },
  {
    taskType: 'verify',
    executor: 'verify',
    tools: ['read', 'bash', 'browser'],
    typicalOutput: 'Verification results',
  },
]

// ==================== AGENT POSITION MAPPING ====================

/**
 * Mapping từ executor → mặc định agent position trong Code Team.
 * Có thể bị override bởi assignedAgent từ SubTask.
 */
const EXECUTOR_TO_AGENT: Record<ExecutorType, string> = {
  analyze: 'TL',      // APEX
  create: 'G2-A',     // BOLT
  modify: 'G2-B',     // SENTINEL
  database: 'G1',     // CORTEX
  api: 'G2-A',        // BOLT
  ui: 'G2-A',         // BOLT
  verify: 'TL',       // APEX
}

// ==================== PUBLIC API ====================

/**
 * Route một sub-task đến executor phù hợp.
 *
 * Giải thuật:
 *   1. Nhận SubTask.type
 *   2. Lookup trong ROUTING_TABLE
 *   3. Nếu type không khớp → fallback về 'modify' executor
 *   4. Nếu subTask có assignedAgent → override agent mặc định
 *   5. Trả về RoutingDecision
 *
 * @param subTask - SubTask từ Layer 2 (DecompositionPlan)
 * @param options - Tùy chọn routing
 * @returns RoutingDecision
 */
export function routeStep(
  subTask: SubTask,
  options: StepRouterOptions = {}
): RoutingDecision {
  const { fallbackExecutor = 'modify', allowAgentOverride = true } = options

  // 1. Lookup routing table
  const entry = ROUTING_TABLE.find((e) => e.taskType === subTask.type)

  // 2. Fallback nếu không tìm thấy
  const executor: ExecutorType = entry ? entry.executor : fallbackExecutor
  const tools = entry ? entry.tools : ['read', 'edit', 'write']

  // 3. Xác định agent position
  let agentPosition = EXECUTOR_TO_AGENT[executor] || 'G2-A'

  // 4. Override nếu subTask có assignedAgent
  if (allowAgentOverride && subTask.assignedAgent) {
    agentPosition = subTask.assignedAgent
  }

  // 5. Build reasoning
  const reasoning = entry
    ? `SubTask "${subTask.name}" (type: ${subTask.type}) → routed to "${executor}" executor with tools: [${tools.join(', ')}]`
    : `SubTask "${subTask.name}" (type: ${subTask.type}) not found in routing table → fallback to "${executor}" executor`

  return {
    subTaskId: subTask.id,
    executor,
    toolsNeeded: tools,
    agentPosition,
    reasoning,
  }
}

/**
 * Trả về toàn bộ routing table (read-only).
 * Dùng cho debugging và UI display.
 */
export function getRoutingTable(): readonly RoutingTableEntry[] {
  return [...ROUTING_TABLE]
}

/**
 * Liệt kê tools cần cho một executor.
 *
 * @param executor - Loại executor
 * @returns Danh sách tool names
 */
export function resolveTools(executor: ExecutorType): string[] {
  const entry = ROUTING_TABLE.find((e) => e.executor === executor)
  return entry ? [...entry.tools] : ['read', 'write']
}

/**
 * Kiểm tra xem một SubTaskType có được hỗ trợ không.
 *
 * @param taskType - Loại task cần kiểm tra
 * @returns true nếu có routing entry
 */
export function isTaskTypeSupported(taskType: SubTaskType): boolean {
  return ROUTING_TABLE.some((e) => e.taskType === taskType)
}

/**
 * Batch route nhiều sub-tasks cùng lúc.
 * Giữ nguyên thứ tự input.
 *
 * @param subTasks - Danh sách sub-tasks
 * @param options - Tùy chọn routing
 * @returns Danh sách RoutingDecision
 */
export function routeSteps(
  subTasks: SubTask[],
  options?: StepRouterOptions
): RoutingDecision[] {
  return subTasks.map((st) => routeStep(st, options))
}