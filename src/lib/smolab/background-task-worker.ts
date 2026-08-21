/**
 * Smolab Background Task Worker — Singleton
 * 
 * Architecture:
 *   - Max 3 concurrent tasks chạy song song
 *   - Mỗi task có AbortController riêng → cancel được
 *   - Khi user switch session → task VẪN CHẠY (không abort)
 *   - Task hoàn thành → update DB → frontend poll để lấy kết quả
 *   - Pending tasks xếp hàng, tự chạy khi có key trống
 * 
 * FIXES (từ lưu ý Phase 3):
 *   - QueuedTask wrapper với taskId → cancel() filter đúng
 *   - startTask nhận taskId trực tiếp → không bị findFirst trả sai task
 */

import { db } from '@/lib/db'

// ==================== TYPES ====================

export type SmolabTaskType = 'agent_chat' | 'team_workflow' | 'agent_react' | 'memory_extraction'

export interface TaskInput {
  type: SmolabTaskType
  sessionId: string
  agentProfileId?: string
  teamName?: string
  inputSummary: string
  execute: (signal: AbortSignal) => Promise<string> // Hàm thực thi, return result JSON
}

/** Wrapper cho queue items — lưu taskId để cancel/filter chính xác */
interface QueuedTask {
  taskId: string
  input: TaskInput
}

interface RunningTask {
  id: string
  input: TaskInput
  controller: AbortController
  startedAt: Date
}

// ==================== SINGLETON WORKER ====================

const MAX_CONCURRENT = 3

class SmolabTaskWorker {
  private running: Map<string, RunningTask> = new Map()
  private queue: QueuedTask[] = []
  private processing = false

  /** Enqueue a new task — tạo DB record, thêm vào queue, bắt đầu processing */
  async enqueue(input: TaskInput): Promise<string> {
    // 1. Tạo DB record
    const task = await db.smolabTask.create({
      data: {
        type: input.type,
        status: 'pending',
        sessionId: input.sessionId,
        agentProfileId: input.agentProfileId || null,
        teamName: input.teamName || null,
        inputSummary: input.inputSummary,
      },
    })

    // 2. Thêm vào queue VỚI taskId (FIX: dùng QueuedTask thay vì TaskInput)
    this.queue.push({ taskId: task.id, input })

    // 3. Thử bắt đầu processing
    this.processQueue()

    return task.id
  }

  /** Cancel a running/pending task */
  async cancel(taskId: string): Promise<boolean> {
    // Cancel nếu đang chạy
    const running = this.running.get(taskId)
    if (running) {
      running.controller.abort()
      this.running.delete(taskId)
    }

    // FIX: Remove khỏi queue bằng taskId (trước đó filter luôn return true)
    this.queue = this.queue.filter(t => t.taskId !== taskId)

    // Update DB
    await db.smolabTask.update({
      where: { id: taskId },
      data: { status: 'cancelled', completedAt: new Date() },
    }).catch(() => {})

    return true
  }

  /** Cancel tất cả tasks của 1 session */
  async cancelSessionTasks(sessionId: string): Promise<number> {
    let count = 0

    // Cancel running tasks
    for (const [id, running] of this.running) {
      if (running.input.sessionId === sessionId) {
        running.controller.abort()
        this.running.delete(id)
        count++
      }
    }

    // Remove queued tasks
    const beforeQueueLen = this.queue.length
    this.queue = this.queue.filter(t => t.input.sessionId !== sessionId)
    count += beforeQueueLen - this.queue.length

    // Update DB
    const result = await db.smolabTask.updateMany({
      where: { sessionId, status: { in: ['pending', 'running'] } },
      data: { status: 'cancelled', completedAt: new Date() },
    })
    return count + result.count
  }

  /** Process queue — start pending tasks up to MAX_CONCURRENT */
  private async processQueue() {
    if (this.processing) return
    this.processing = true

    try {
      while (this.running.size < MAX_CONCURRENT && this.queue.length > 0) {
        const queued = this.queue.shift()!
        await this.startTask(queued)
      }
    } finally {
      this.processing = false
    }
  }

  /** Start a single task — FIX: nhận QueuedTask với taskId sẵn, không tìm lại DB */
  private async startTask(queued: QueuedTask) {
    const { taskId, input } = queued

    // Verify task vẫn còn pending (có thể đã bị cancel)
    const task = await db.smolabTask.findUnique({ where: { id: taskId } })
    if (!task || task.status !== 'pending') {
      // Task đã bị cancel hoặc không còn pending — bỏ qua
      return
    }

    const controller = new AbortController()
    const runningTask: RunningTask = {
      id: taskId,
      input,
      controller,
      startedAt: new Date(),
    }

    this.running.set(taskId, runningTask)

    // Update DB → running
    await db.smolabTask.update({
      where: { id: taskId },
      data: { status: 'running', startedAt: new Date() },
    })

    // Execute task (KHÔNG await — chạy nền)
    this.executeTask(taskId, input, controller.signal)
  }

  /** Execute a task — runs in background, updates DB on completion */
  private async executeTask(taskId: string, input: TaskInput, signal: AbortSignal) {
    try {
      const result = await input.execute(signal)

      if (signal.aborted) {
        // cancel() already updated DB — silently ignore if record not found
        await db.smolabTask.update({
          where: { id: taskId },
          data: { status: 'cancelled', completedAt: new Date() },
        }).catch(() => {})
      } else {
        await db.smolabTask.update({
          where: { id: taskId },
          data: {
            status: 'completed',
            progress: 100,
            result,
            completedAt: new Date(),
          },
        })
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)

      // Don't update if already cancelled
      if (signal.aborted) {
        await db.smolabTask.update({
          where: { id: taskId },
          data: { status: 'cancelled', completedAt: new Date() },
        }).catch(() => {})
      } else {
        await db.smolabTask.update({
          where: { id: taskId },
          data: { status: 'failed', error: errorMsg, completedAt: new Date() },
        })
      }
    } finally {
      this.running.delete(taskId)
      // Process next in queue
      this.processQueue()
    }
  }

  /** Get running task count */
  getRunningCount(): number {
    return this.running.size
  }

  /** Get pending task count */
  getPendingCount(): number {
    return this.queue.length
  }

  /** Get all running tasks info (for debug/status) */
  getRunningTasks(): Array<{ id: string; sessionId: string; type: string; startedAt: Date }> {
    return Array.from(this.running.values()).map(t => ({
      id: t.id,
      sessionId: t.input.sessionId,
      type: t.input.type,
      startedAt: t.startedAt,
    }))
  }

  /** Shutdown — cancel all running tasks */
  async shutdown() {
    for (const [id, running] of this.running) {
      running.controller.abort()
      await db.smolabTask.update({
        where: { id },
        data: { status: 'cancelled', completedAt: new Date() },
      }).catch(() => {})
    }
    this.running.clear()
    this.queue = []
  }
}

// Singleton instance — survives hot-reload via globalThis
const globalForWorker = globalThis as unknown as {
  smolabWorker: SmolabTaskWorker | undefined
}

export const smolabWorker = globalForWorker.smolabWorker ?? new SmolabTaskWorker()
if (process.env.NODE_ENV !== 'production') globalForWorker.smolabWorker = smolabWorker
