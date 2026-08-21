/**
 * Layer 2.1: Problem Decomposition
 *
 * Chia task lớn thành các sub-tasks nhỏ, có thể thực hiện tuần tự.
 * Luồng xử lý:
 *   1. classifySubTaskType()     → Xác định loại sub-tasks cần tạo
 *   2. generateSubTasks()        → Sinh danh sách sub-tasks (LLM hoặc heuristic)
 *   3. analyzeDependencies()     → Xác định quan hệ phụ thuộc
 *   4. topologicalSort()         → Sắp xếp thứ tự thực thi
 *   5. estimateComplexity()      → Gán complexity và token budget
 *   6. identifyCriticalPath()    → Tìm đường găng
 */

import { callLLM } from '@/lib/llm'
import type { IntentResult, MentalModel } from '@/lib/intake'
import type {
  SubTask,
  SubTaskType,
  Complexity,
  DependencyGraph,
  DecompositionPlan,
  DecomposerOptions,
} from './types'
import { resolveCircularDependencies } from './circular-resolver'

// ==================== CONSTANTS ====================

/** Giới hạn mặc định số sub-tasks */
const DEFAULT_MAX_SUBTASKS = 15

/** Heuristic token budget theo loại task */
const TOKEN_BUDGETS: Record<string, number> = {
  think: 2000,
  explore: 4000,
  create: 6000,
  modify: 4000,
  verify: 2000,
  report: 6000,
}

/** Complexity multiplier */
const COMPLEXITY_MULTIPLIERS: Record<Complexity, number> = {
  simple: 1.0,
  medium: 1.5,
  complex: 2.0,
}

// ==================== MAIN FUNCTION ====================

/**
 * Phân rã task thành các sub-tasks.
 *
 * @param task - Task gốc từ user
 * @param intentResult - Kết quả phân tích intent từ Layer 1
 * @param mentalModel - Mental model của project từ Layer 1
 * @param options - Cấu hình decomposition
 * @returns DecompositionPlan
 */
export async function decomposeTask(
  task: string,
  intentResult: IntentResult,
  mentalModel: MentalModel,
  options: DecomposerOptions = {},
): Promise<DecompositionPlan> {
  const { useLLM = true, maxSubTasks = DEFAULT_MAX_SUBTASKS } = options

  // Step 1: Xác định loại sub-tasks cần tạo
  const subTaskTypes = classifySubTaskType(intentResult)

  // Step 2: Sinh danh sách sub-tasks
  let subTasks: SubTask[]
  if (useLLM) {
    try {
      subTasks = await generateSubTasksWithLLM(task, intentResult, mentalModel, subTaskTypes, maxSubTasks)
    } catch (err) {
      console.warn('[Decomposer] LLM failed, falling back to heuristic:', err)
      subTasks = generateSubTasksHeuristic(task, intentResult, mentalModel, subTaskTypes, maxSubTasks)
    }
  } else {
    subTasks = generateSubTasksHeuristic(task, intentResult, mentalModel, subTaskTypes, maxSubTasks)
  }

  // Step 3: Phân tích dependencies
  const dependencyGraph = analyzeDependencies(subTasks)

  // Step 4: Topological sort
  dependencyGraph.topologicalOrder = topologicalSort(dependencyGraph)

  // Step 5: Ước lượng complexity và token budget
  estimateComplexity(subTasks, intentResult)

  // Step 6: Tìm critical path
  const criticalPath = identifyCriticalPath(dependencyGraph)

  // Step 7: Resolve circular dependencies
  const { resolved: resolvedGraph, warnings: circularWarnings, mergedSubTasks } =
    resolveCircularDependencies(dependencyGraph)

  // Tính tổng token budget
  const totalEstimatedTokens = subTasks.reduce((sum, st) => sum + st.estimatedTokens, 0)

  // Tính tổng estimated time dựa trên critical path
  const totalEstimatedTime = estimateTime(subTasks, criticalPath)

  // Tổng hợp risks
  const risks = [...new Set(subTasks.flatMap(st => st.risks))]

  return {
    originalTask: task,
    subTasks,
    dependencyGraph: resolvedGraph,
    totalEstimatedTokens,
    totalEstimatedTime,
    criticalPath,
    risks,
    mergedSubTasks,
    circularWarnings,
  }
}

// ==================== STEP 1: CLASSIFY SUB-TASK TYPE ====================

/**
 * Xác định loại sub-tasks cần tạo dựa trên intent.
 */
function classifySubTaskType(intentResult: IntentResult): SubTaskType[] {
  const types: SubTaskType[] = []
  const { taskType, constraints } = intentResult

  // Task tạo mới → cần database, backend, frontend, integration
  if (taskType === 'create' || taskType === 'hybrid') {
    if (constraints.database) types.push('database')
    if (constraints.api || constraints.framework) types.push('backend')
    if (constraints.framework) types.push('frontend')
    types.push('integration')
  }

  // Task sửa đổi → cần frontend/backend tùy loại
  if (taskType === 'modify') {
    if (constraints.framework) types.push('frontend')
    if (constraints.api) types.push('backend')
    if (constraints.database) types.push('database')
  }

  // Task fix → cần tìm bug (verify + frontend/backend)
  if (taskType === 'fix') {
    types.push('verify')
    types.push('frontend')
    types.push('backend')
  }

  // Task analyze → chỉ cần verify
  if (taskType === 'analyze') {
    types.push('verify')
  }

  // Task refactor → frontend + backend
  if (taskType === 'refactor') {
    types.push('frontend')
    types.push('backend')
  }

  // Luôn thêm verify cuối cùng
  if (!types.includes('verify')) {
    types.push('verify')
  }

  return [...new Set(types)]
}

// ==================== STEP 2: GENERATE SUB-TASKS ====================

/**
 * Sinh sub-tasks bằng LLM.
 */
async function generateSubTasksWithLLM(
  task: string,
  intentResult: IntentResult,
  mentalModel: MentalModel,
  subTaskTypes: SubTaskType[],
  maxSubTasks: number,
): Promise<SubTask[]> {
  const prompt = buildDecompositionPrompt(task, intentResult, mentalModel, subTaskTypes, maxSubTasks)

  const result = await callLLM(
    prompt,
    'Bạn là một senior software engineer. Phân rã task thành các sub-tasks rõ ràng, có thể thực hiện tuần tự. Output JSON array.',
    'decompose_task',
    { temperature: 0.3, maxTokens: 4000 }
  )

  // Parse JSON từ output
  const jsonMatch = result.content.match(/```json\s*([\s\S]*?)\s*```/) || result.content.match(/\[([\s\S]*)\]/)
  if (!jsonMatch) {
    throw new Error('LLM did not return valid JSON for sub-tasks')
  }

  const parsed = JSON.parse(jsonMatch[1])
  const subTasks: SubTask[] = Array.isArray(parsed) ? parsed : parsed.subTasks || []

  // Validate và bổ sung thông tin
  return subTasks.map((st, index) => ({
    ...st,
    id: st.id || `st_${Date.now()}_${index}`,
    dependencies: st.dependencies || [],
    estimatedComplexity: st.estimatedComplexity || 'medium',
    estimatedTokens: st.estimatedTokens || 4000,
    filesToRead: st.filesToRead || [],
    filesToWrite: st.filesToWrite || [],
    risks: st.risks || [],
  }))
}

/**
 * Sinh sub-tasks bằng heuristic (fallback khi LLM fail).
 */
function generateSubTasksHeuristic(
  task: string,
  intentResult: IntentResult,
  _mentalModel: MentalModel,
  subTaskTypes: SubTaskType[],
  maxSubTasks: number,
): SubTask[] {
  const subTasks: SubTask[] = []
  const { taskType, constraints } = intentResult

  // Helper: tạo sub-task
  const createSubTask = (name: string, type: SubTaskType, description: string, complexity: Complexity = 'medium'): SubTask => ({
    id: `st_${Date.now()}_${subTasks.length}`,
    name,
    type,
    description,
    goal: description,
    expectedOutput: `${name} hoàn thành`,
    verificationCriteria: `Kiểm tra ${name.toLowerCase()} hoạt động đúng`,
    dependencies: [],
    estimatedComplexity: complexity,
    estimatedTokens: TOKEN_BUDGETS[type] || 4000,
    filesToRead: [],
    filesToWrite: [],
    risks: [],
  })

  // Task tạo mới
  if (taskType === 'create' || taskType === 'hybrid') {
    if (subTaskTypes.includes('database')) {
      subTasks.push(createSubTask('Tạo database schema', 'database', 'Thiết kế và tạo schema cho database', 'medium'))
    }
    if (subTaskTypes.includes('backend')) {
      subTasks.push(createSubTask('Tạo API endpoints', 'backend', 'Tạo các API endpoints cần thiết', 'medium'))
    }
    if (subTaskTypes.includes('frontend')) {
      subTasks.push(createSubTask('Tạo UI components', 'frontend', 'Tạo các UI components', 'medium'))
      subTasks.push(createSubTask('Tạo pages', 'frontend', 'Tạo các trang UI', 'medium'))
    }
    if (subTaskTypes.includes('integration')) {
      subTasks.push(createSubTask('Kết nối UI và API', 'integration', 'Kết nối frontend với backend', 'medium'))
    }
  }

  // Task sửa đổi
  if (taskType === 'modify') {
    if (subTaskTypes.includes('frontend')) {
      subTasks.push(createSubTask('Sửa đổi UI', 'frontend', 'Sửa đổi UI theo yêu cầu', 'medium'))
    }
    if (subTaskTypes.includes('backend')) {
      subTasks.push(createSubTask('Sửa đổi API', 'backend', 'Sửa đổi API theo yêu cầu', 'medium'))
    }
    if (subTaskTypes.includes('database')) {
      subTasks.push(createSubTask('Sửa đổi schema', 'database', 'Sửa đổi database schema', 'medium'))
    }
  }

  // Task fix
  if (taskType === 'fix') {
    subTasks.push(createSubTask('Tìm và sửa lỗi', 'verify', 'Tìm root cause và sửa lỗi', 'complex'))
  }

  // Task analyze
  if (taskType === 'analyze') {
    subTasks.push(createSubTask('Phân tích code', 'verify', 'Phân tích và báo cáo', 'simple'))
  }

  // Task refactor
  if (taskType === 'refactor') {
    subTasks.push(createSubTask('Refactor code', 'frontend', 'Tái cấu trúc code', 'complex'))
  }

  // Luôn thêm verify
  subTasks.push(createSubTask('Verify kết quả', 'verify', 'Kiểm tra toàn bộ flow', 'simple'))

  // Giới hạn số sub-tasks
  return subTasks.slice(0, maxSubTasks)
}

/**
 * Build prompt cho LLM decomposition.
 */
function buildDecompositionPrompt(
  task: string,
  intentResult: IntentResult,
  mentalModel: MentalModel,
  subTaskTypes: SubTaskType[],
  maxSubTasks: number,
): string {
  return `Phân rã task sau thành các sub-tasks. Mỗi sub-task phải có: id, name, type, description, goal, expectedOutput, verificationCriteria, dependencies, estimatedComplexity (simple/medium/complex), estimatedTokens, filesToRead, filesToWrite, risks.

Task: ${task}
Intent: ${intentResult.taskType}
Framework: ${intentResult.constraints.framework || 'N/A'}
Database: ${intentResult.constraints.database || 'N/A'}
API: ${intentResult.constraints.api || 'N/A'}

Loại sub-tasks cần tạo: ${subTaskTypes.join(', ')}

Project structure:
- Pages: ${mentalModel.structure.pages.length} files
- Components: ${mentalModel.structure.components.length} files
- APIs: ${mentalModel.structure.apis.length} files
- Libs: ${mentalModel.structure.libs.length} files

Output JSON array (tối đa ${maxSubTasks} sub-tasks):

\`\`\`json
[
  {
    "id": "st_1",
    "name": "Tạo Prisma schema",
    "type": "database",
    "description": "Thiết kế schema cho Post model",
    "goal": "Có schema đúng với yêu cầu",
    "expectedOutput": "schema.prisma với Post model",
    "verificationCriteria": "Prisma generate thành công",
    "dependencies": [],
    "estimatedComplexity": "medium",
    "estimatedTokens": 4000,
    "filesToRead": [],
    "filesToWrite": ["prisma/schema.prisma"],
    "risks": ["Schema conflict với existing models"]
  }
]
\`\`\``
}

// ==================== STEP 3: ANALYZE DEPENDENCIES ====================

/**
 * Phân tích dependencies giữa các sub-tasks.
 */
function analyzeDependencies(subTasks: SubTask[]): DependencyGraph {
  const nodes = new Map<string, SubTask>()
  const edges: Array<{ from: string; to: string }> = []

  for (const subTask of subTasks) {
    nodes.set(subTask.id, subTask)
  }

  // Heuristic: database → backend → frontend → integration → verify
  const typeMap: Record<string, number> = {
    database: 1,
    backend: 2,
    frontend: 3,
    integration: 4,
    config: 0,
    verify: 5,
  }

  for (let i = 0; i < subTasks.length; i++) {
    for (let j = i + 1; j < subTasks.length; j++) {
      const a = subTasks[i]
      const b = subTasks[j]

      const aOrder = a.type in typeMap ? typeMap[a.type] : 99
      const bOrder = b.type in typeMap ? typeMap[b.type] : 99

      // Nếu a phải xong trước b
      if (aOrder < bOrder) {
        a.dependencies.push(b.id)
        edges.push({ from: a.id, to: b.id })
      }
    }
  }

  return {
    nodes,
    edges,
    topologicalOrder: [],
    parallelGroups: [],
  }
}

// ==================== STEP 4: TOPOLOGICAL SORT ====================

/**
 * Topological sort để xác định thứ tự thực thi.
 */
function topologicalSort(graph: DependencyGraph): string[] {
  const visited = new Set<string>()
  const tempMark = new Set<string>()
  const order: string[] = []

  function visit(nodeId: string) {
    if (tempMark.has(nodeId)) {
      console.warn(`[Decomposer] Circular dependency detected: ${nodeId}`)
      return
    }
    if (visited.has(nodeId)) return

    tempMark.add(nodeId)
    const node = graph.nodes.get(nodeId)
    if (node) {
      for (const depId of node.dependencies) {
        visit(depId)
      }
    }
    tempMark.delete(nodeId)
    visited.add(nodeId)
    order.push(nodeId)
  }

  for (const [nodeId] of graph.nodes) {
    if (!visited.has(nodeId)) {
      visit(nodeId)
    }
  }

  return order.reverse()
}

// ==================== STEP 5: ESTIMATE COMPLEXITY ====================

/**
 * Gán complexity và token budget cho mỗi sub-task.
 */
function estimateComplexity(subTasks: SubTask[], intentResult: IntentResult): void {
  for (const subTask of subTasks) {
    // Base budget theo loại task
    let baseBudget = TOKEN_BUDGETS[subTask.type] || 4000

    // Complexity multiplier
    const multiplier = COMPLEXITY_MULTIPLIERS[subTask.estimatedComplexity] || 1.0

    // Safety margin (+20%)
    const safetyMargin = 1.2

    subTask.estimatedTokens = Math.round(baseBudget * multiplier * safetyMargin)

    // Gán agent dựa trên loại task
    if (subTask.type === 'frontend') {
      subTask.assignedAgent = 'G2-B'
    } else if (subTask.type === 'backend') {
      subTask.assignedAgent = 'G2-A'
    } else if (subTask.type === 'database') {
      subTask.assignedAgent = 'G1'
    } else if (subTask.type === 'integration') {
      subTask.assignedAgent = 'G3'
    } else if (subTask.type === 'verify') {
      subTask.assignedAgent = 'TL'
    }
  }
}

// ==================== STEP 6: IDENTIFY CRITICAL PATH ====================

/**
 * Ước lượng thời gian thực hiện dựa trên critical path.
 *
 * @param subTasks - Danh sách sub-tasks
 * @param criticalPath - Đường găng
 * @returns Thời gian ước lượng (ms)
 */
export function estimateTime(subTasks: SubTask[], criticalPath: string[]): number {
  const TIME_RANGES: Record<Complexity, [number, number]> = {
    simple: [30_000, 120_000],   // 30s - 2min
    medium: [120_000, 300_000],  // 2min - 5min
    complex: [300_000, 900_000], // 5min - 15min
  }

  let totalTime = 0

  for (const subTaskId of criticalPath) {
    const subTask = subTasks.find(st => st.id === subTaskId)
    if (!subTask) continue

    const [min, max] = TIME_RANGES[subTask.estimatedComplexity]
    const avg = (min + max) / 2
    const fileMultiplier = Math.max(1, (subTask.filesToWrite?.length || 0) * 0.5)
    totalTime += avg * fileMultiplier
  }

  return Math.round(totalTime)
}

/**
 * Tìm đường găng (critical path) — chuỗi sub-tasks dài nhất.
 */
function identifyCriticalPath(graph: DependencyGraph): string[] {
  const distances = new Map<string, number>()
  const predecessors = new Map<string, string | null>()

  // Khởi tạo
  for (const [nodeId] of graph.nodes) {
    distances.set(nodeId, 0)
    predecessors.set(nodeId, null)
  }

  // Tính longest path
  for (const nodeId of graph.topologicalOrder) {
    const node = graph.nodes.get(nodeId)
    if (!node) continue

    for (const depId of node.dependencies) {
      const currentDist = distances.get(nodeId) || 0
      const depDist = distances.get(depId) || 0

      if (currentDist + 1 > depDist) {
        distances.set(depId, currentDist + 1)
        predecessors.set(depId, nodeId)
      }
    }
  }

  // Tìm node cuối cùng của critical path
  let maxDist = 0
  let endNode: string | null = null
  for (const [nodeId, dist] of distances) {
    if (dist > maxDist) {
      maxDist = dist
      endNode = nodeId
    }
  }

  // Truy vết ngược
  const path: string[] = []
  let current: string | null = endNode
  while (current) {
    path.unshift(current)
    current = predecessors.get(current) || null
  }

  return path
}