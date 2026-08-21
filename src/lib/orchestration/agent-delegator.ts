/**
 * Layer 7.3: Agent Delegation — Sub-agent Dispatch
 *
 * Delegate task phức tạp cho sub-agents chuyên dụng, chạy song song khi có thể.
 *
 * Nguyên tắc:
 *   1. Mỗi sub-agent nhận context đầy đủ
 *   2. Sub-agent tự chủ (autonomous) — không cần hỏi lại main agent
 *   3. Kết quả được integrate cẩn th
ận
 *   4. Main agent verify kết quả sub-agent trước khi accept
 */

import type {
  AgentDelegator,
  DelegatedTask,
  DelegatedTaskResult,
  DelegationDecision,
  DelegationRequest,
  DelegationStrategy,
} from './types'
import type { AgentPosition } from '@/lib/code-team/types'

// ==================== CONSTANTS ====================

/** Timeout mặc định cho mỗi delegated task (ms) */
const DEFAULT_TASK_TIMEOUT_MS = 120_000 // 2 minutes

/** Số lần retry tối đa cho mỗi task */
const MAX_RETRIES = 2

/** Ngưỡng để delegate (task phức tạp hơn ngưỡng này) */
const DELEGATION_COMPLEXITY_THRESHOLD = 'medium'

// ==================== AGENT DELEGATOR IMPLEMENTATION ====================

/**
 * Create a new Agent Delegator for the given session.
 */
export function createAgentDelegator(
  sessionId: string,
  emit?: (event: Record<string, unknown>) => void
): AgentDelegator {
  // Track active delegations for cancellation
  const activeDelegations = new Map<string, AbortController>()

  return {
    shouldDelegate(request: DelegationRequest): DelegationDecision {
      return shouldDelegateInternal(request)
    },

    async delegate(task: DelegatedTask): Promise<DelegatedTaskResult> {
      return delegateInternal(task, activeDelegations, emit)
    },

    async delegateParallel(tasks: DelegatedTask[]): Promise<DelegatedTaskResult[]> {
      return delegateParallelInternal(tasks, activeDelegations, emit)
    },

    collectResults(results: DelegatedTaskResult[]): string {
      return collectResultsInternal(results)
    },

    cancelDelegation(taskId: string): void {
      const controller = activeDelegations.get(taskId)
      if (controller) {
        controller.abort()
        activeDelegations.delete(taskId)
      }
    },
  }
}

// ==================== INTERNAL FUNCTIONS ====================

/**
 * Determine if a task should be delegated to sub-agents.
 */
function shouldDelegateInternal(request: DelegationRequest): DelegationDecision {
  const {
    complexity,
    canParallelize,
    requiresSpecialization,
    estimatedDuration,
    availableAgents,
  } = request

  // Rule 1: Task đơn giản → không delegate
  if (complexity === 'simple') {
    return {
      shouldDelegate: false,
      strategy: 'none',
      tasks: [],
      reasoning: 'Task đơn giản, tự làm nhanh hơn',
      estimatedTimeSaved: 0,
      risks: [],
    }
  }

  // Rule 2: Có thể parallel → delegate multi-agent
  if (canParallelize && availableAgents.length >= 2) {
    const tasks = buildParallelTasks(request, availableAgents)
    return {
      shouldDelegate: true,
      strategy: 'multi_agent',
      tasks,
      reasoning: `Task có thể parallel với ${availableAgents.length} agents`,
      estimatedTimeSaved: estimatedDuration * 0.4, // ~40% time saved
      risks: ['Coordination overhead', 'Context duplication'],
    }
  }

  // Rule 3: Cần specialized knowledge → delegate single agent
  if (requiresSpecialization && availableAgents.length > 0) {
    const tasks = buildSingleAgentTask(request, availableAgents[0])
    return {
      shouldDelegate: true,
      strategy: 'single_agent',
      tasks,
      reasoning: `Task cần specialized knowledge từ ${availableAgents[0]}`,
      estimatedTimeSaved: estimatedDuration * 0.2,
      risks: ['Context transfer overhead'],
    }
  }

  // Rule 4: Task dài, cần iterative → delegate
  if (estimatedDuration > 60_000) { // > 1 phút
    const fallbackAgent: AgentPosition = availableAgents[0] || 'G2-A'
    const tasks = buildSingleAgentTask(request, fallbackAgent)
    return {
      shouldDelegate: true,
      strategy: 'single_agent',
      tasks,
      reasoning: 'Task dài, cần iterative → delegate cho sub-agent',
      estimatedTimeSaved: estimatedDuration * 0.15,
      risks: ['Communication overhead'],
    }
  }

  // Default: không delegate
  return {
    shouldDelegate: false,
    strategy: 'none',
    tasks: [],
    reasoning: 'Task không đủ điều kiện để delegate',
    estimatedTimeSaved: 0,
    risks: [],
  }
}

/**
 * Delegate a single task to a sub-agent.
 */
async function delegateInternal(
  task: DelegatedTask,
  activeDelegations: Map<string, AbortController>,
  emit?: (event: Record<string, unknown>) => void
): Promise<DelegatedTaskResult> {
  const controller = new AbortController()
  activeDelegations.set(task.id, controller)

  // Emit delegation start event
  if (emit) {
    emit({
      type: 'delegation_start',
      taskId: task.id,
      agentPosition: task.assignedAgent,
      description: task.description,
    })
  }

  const startTime = Date.now()

  try {
    // Simulate sub-agent execution (replace with actual implementation)
    const result = await executeSubAgent(task, controller.signal)

    // Emit delegation complete event
    if (emit) {
      emit({
        type: 'delegation_complete',
        taskId: task.id,
        agentPosition: task.assignedAgent,
        success: result.success,
        duration: Date.now() - startTime,
      })
    }

    return result
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)

    // Emit delegation error
    if (emit) {
      emit({
        type: 'delegation_error',
        taskId: task.id,
        agentPosition: task.assignedAgent,
        error: errorMsg,
      })
    }

    return {
      taskId: task.id,
      agentPosition: task.assignedAgent,
      success: false,
      output: '',
      duration: Date.now() - startTime,
      tokensUsed: 0,
      errors: [{
        id: `err-${Date.now()}`,
        timestamp: new Date(),
        errorType: 'runtime',
        severity: 'high',
        message: errorMsg,
        rootCause: 'Delegation execution failed',
        fixStrategy: 'surgical',
        fixApplied: false,
        fixDescription: '',
        loopDetected: false,
        loopCount: 0,
      }],
      filesCreated: [],
      filesModified: [],
    }
  } finally {
    activeDelegations.delete(task.id)
  }
}

/**
 * Delegate multiple tasks in parallel.
 */
async function delegateParallelInternal(
  tasks: DelegatedTask[],
  activeDelegations: Map<string, AbortController>,
  emit?: (event: Record<string, unknown>) => void
): Promise<DelegatedTaskResult[]> {
  // Run all tasks in parallel with Promise.allSettled
  const promises = tasks.map((task) => delegateInternal(task, activeDelegations, emit))

  const results = await Promise.allSettled(promises)

  // Map results to DelegatedTaskResult
  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value
    }

    // Rejected promise
    const task = tasks[index]
    return {
      taskId: task.id,
      agentPosition: task.assignedAgent,
      success: false,
      output: '',
      duration: 0,
      tokensUsed: 0,
      errors: [{
        id: `err-${Date.now()}`,
        timestamp: new Date(),
        errorType: 'runtime',
        severity: 'critical',
        message: result.reason instanceof Error ? result.reason.message : String(result.reason),
        rootCause: 'Parallel delegation failed',
        fixStrategy: 'surgical',
        fixApplied: false,
        fixDescription: '',
        loopDetected: false,
        loopCount: 0,
      }],
      filesCreated: [],
      filesModified: [],
    }
  })
}

/**
 * Collect and summarize results from multiple sub-agents.
 */
function collectResultsInternal(results: DelegatedTaskResult[]): string {
  const successful = results.filter((r) => r.success)
  const failed = results.filter((r) => !r.success)

  const parts: string[] = [
    `## Delegation Results`,
    ``,
    `**Summary:** ${successful.length}/${results.length} tasks completed successfully`,
    ``,
  ]

  if (successful.length > 0) {
    parts.push(`### Successful Tasks`)
    for (const result of successful) {
      parts.push(`- **${result.agentPosition}**: ${result.output.slice(0, 200)}...`)
      if (result.filesCreated.length > 0) {
        parts.push(`  - Files created: ${result.filesCreated.join(', ')}`)
      }
      if (result.filesModified.length > 0) {
        parts.push(`  - Files modified: ${result.filesModified.join(', ')}`)
      }
    }
    parts.push(``)
  }

  if (failed.length > 0) {
    parts.push(`### Failed Tasks`)
    for (const result of failed) {
      parts.push(`- **${result.agentPosition}**: ${result.errors[0]?.message || 'Unknown error'}`)
    }
    parts.push(``)
  }

  // Aggregate files
  const allFilesCreated = results.flatMap((r) => r.filesCreated)
  const allFilesModified = results.flatMap((r) => r.filesModified)

  if (allFilesCreated.length > 0 || allFilesModified.length > 0) {
    parts.push(`### Files Changed`)
    if (allFilesCreated.length > 0) {
      parts.push(`- Created: ${allFilesCreated.join(', ')}`)
    }
    if (allFilesModified.length > 0) {
      parts.push(`- Modified: ${allFilesModified.join(', ')}`)
    }
    parts.push(``)
  }

  return parts.join('\n')
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Build parallel tasks for multi-agent delegation.
 */
function buildParallelTasks(
  request: DelegationRequest,
  availableAgents: AgentPosition[],
  sessionId: string = 'unknown-session'
): DelegatedTask[] {
  // Split the work among available agents
  // In a real implementation, this would analyze the task and split it
  const tasks: DelegatedTask[] = []

  for (let i = 0; i < availableAgents.length; i++) {
    const agent = availableAgents[i]
    tasks.push({
      id: `task-${Date.now()}-${i}`,
      parentSessionId: sessionId,
      assignedAgent: agent,
      taskType: 'parallel_subtask',
      description: `Parallel sub-task ${i + 1}/${availableAgents.length}`,
      input: request.currentContext,
      expectedOutput: 'Completed sub-task result',
      context: request.currentContext,
      timeout: DEFAULT_TASK_TIMEOUT_MS,
      priority: i,
    })
  }

  return tasks
}

/**
 * Build a single agent task.
 */
function buildSingleAgentTask(
  request: DelegationRequest,
  agent: AgentPosition,
  sessionId: string = 'unknown-session'
): DelegatedTask[] {
  return [{
    id: `task-${Date.now()}`,
    parentSessionId: sessionId,
    assignedAgent: agent,
    taskType: 'specialized',
    description: 'Specialized task for single agent',
    input: request.currentContext,
    expectedOutput: 'Completed task result',
    context: request.currentContext,
    timeout: DEFAULT_TASK_TIMEOUT_MS,
    priority: 0,
  }]
}

/**
 * Execute a sub-agent task.
 *
 * ⚠️  PLACEHOLDER: This is a stub implementation. In production, this should
 *    integrate with the workflow engine to actually execute the task.
 *
 *    To integrate:
 *      1. Import the workflow engine or agent runner
 *      2. Call the appropriate function with task.assignedAgent and task.input
 *      3. Return the actual result
 *
 *    For now, this simulates successful execution for testing purposes.
 */
async function executeSubAgent(
  task: DelegatedTask,
  signal: AbortSignal
): Promise<DelegatedTaskResult> {
  // Check if aborted
  if (signal.aborted) {
    throw new Error('Task was cancelled')
  }

  // Simulate work (placeholder — replace with actual sub-agent execution)
  await new Promise((resolve) => setTimeout(resolve, 100))

  return {
    taskId: task.id,
    agentPosition: task.assignedAgent,
    success: true,
    output: `Task completed by ${task.assignedAgent}`,
    duration: 100,
    tokensUsed: 0,
    errors: [],
    filesCreated: [],
    filesModified: [],
  }
}
