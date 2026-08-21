import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { smolabWorker } from '@/lib/smolab/background-task-worker'

export const dynamic = 'force-dynamic'

/** GET /api/smolab/tasks — Lấy task status */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('sessionId')
  const taskType = searchParams.get('type')
  const status = searchParams.get('status')

  try {
    const where: Record<string, unknown> = {}
    if (sessionId) where.sessionId = sessionId
    if (taskType) where.type = taskType
    if (status) where.status = status

    const tasks = await db.smolabTask.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({
      tasks,
      workerStatus: {
        running: smolabWorker.getRunningCount(),
        pending: smolabWorker.getPendingCount(),
        runningTasks: smolabWorker.getRunningTasks(),
      },
    })
  } catch (err) {
    console.error('[Smolab Tasks] GET error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lỗi' }, { status: 500 })
  }
}

/** POST /api/smolab/tasks — Enqueue a new task manually (mainly for testing) */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { type, sessionId, agentProfileId, teamName, inputSummary, execute } = body

    if (!type || !sessionId || !inputSummary) {
      return NextResponse.json(
        { error: 'Thiếu type, sessionId, hoặc inputSummary' },
        { status: 400 }
      )
    }

    // Manual enqueue — caller must provide execute function (not serializable, for testing only)
    // In production, tasks are created via /api/smolab/chat
    const taskId = await smolabWorker.enqueue({
      type,
      sessionId,
      agentProfileId,
      teamName,
      inputSummary,
      execute: execute || (async () => JSON.stringify({ message: 'Task completed' })),
    })

    return NextResponse.json({ taskId, status: 'pending' })
  } catch (err) {
    console.error('[Smolab Tasks] POST error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lỗi' }, { status: 500 })
  }
}
