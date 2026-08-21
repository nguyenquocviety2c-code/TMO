import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { smolabWorker } from '@/lib/smolab/background-task-worker'

export const dynamic = 'force-dynamic'

/** GET /api/smolab/tasks/[id] — Chi tiết 1 task */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const task = await db.smolabTask.findUnique({ where: { id } })
    if (!task) return NextResponse.json({ error: 'Task không tồn tại' }, { status: 404 })
    return NextResponse.json({ task })
  } catch (err) {
    console.error('[Smolab Task] GET error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lỗi' }, { status: 500 })
  }
}

/** PATCH /api/smolab/tasks/[id] — Cancel task */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    await smolabWorker.cancel(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Smolab Task] PATCH cancel error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lỗi' }, { status: 500 })
  }
}
