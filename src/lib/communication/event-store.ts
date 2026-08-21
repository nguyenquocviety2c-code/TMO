/**
 * EventStore — Persist + Replay SSE Events
 *
 * Lưu trữ WorkflowEvent vào DB (WorkflowEventLog) với sequence number tăng dần.
 * Hỗ trợ SSE replay: client reconnect với ?lastSeq=N → nhận events đã miss.
 *
 * Data flow:
 *   Write: workflow-engine safeEmit → EventStore.appendEvent (fire-and-forget) → SSE emit
 *   Read:  client reconnect → route handler gọi getEventsSince → replay events trước stream live
 */

import { db } from '@/lib/db'

// ==================== TYPES ====================

export interface StoredEvent {
  id: string
  sessionId: string
  seq: number
  type: string
  payload: Record<string, unknown>
  createdAt: Date
}

// ==================== STATE ====================

/**
 * In-memory sequence counters per session.
 * Khởi tạo từ MAX(seq) trong DB khi session được dùng lần đầu.
 * Tránh query DB mỗi lần appendEvent.
 */
const seqCounters = new Map<string, number>()

/**
 * Lấy seq hiện tại cho session (từ cache hoặc DB).
 */
async function getCurrentSeq(sessionId: string): Promise<number> {
  // Check cache first
  const cached = seqCounters.get(sessionId)
  if (cached !== undefined) return cached

  // Query DB for max seq
  try {
    const lastEvent = await db.workflowEventLog.findFirst({
      where: { sessionId },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    })
    const maxSeq = lastEvent?.seq ?? 0
    seqCounters.set(sessionId, maxSeq)
    return maxSeq
  } catch {
    // DB unavailable — start from 0 (events won't be persisted but won't crash)
    seqCounters.set(sessionId, 0)
    return 0
  }
}

// ==================== PUBLIC API ====================

/**
 * Append a workflow event to the event store.
 *
 * Fire-and-forget: lỗi DB chỉ console.warn, không throw.
 * Trả về sequence number của event (dùng cho SSE replay).
 *
 * @param sessionId - Session ID (liên kết CodeTeamSession.sessionId)
 * @param event - WorkflowEvent object (có type + payload fields)
 * @returns Sequence number của event đã append
 */
export async function appendEvent(
  sessionId: string,
  event: Record<string, unknown>
): Promise<number> {
  // Tính seq tiếp theo
  const currentSeq = await getCurrentSeq(sessionId)
  const nextSeq = currentSeq + 1

  // Cập nhật cache ngay (trước DB write) để tránh race condition
  seqCounters.set(sessionId, nextSeq)

  // Fire-and-forget DB write
  try {
    await db.workflowEventLog.create({
      data: {
        sessionId,
        seq: nextSeq,
        type: (event.type as string) || 'unknown',
        payload: JSON.stringify(event),
      },
    })
  } catch (err) {
    // DB write failed — không throw, chỉ log
    console.warn(`[EventStore] Failed to persist event seq=${nextSeq} for session ${sessionId}:`, err)
  }

  return nextSeq
}

/**
 * Lấy tất cả events sau một sequence number cho trước.
 * Dùng cho SSE replay khi client reconnect.
 *
 * @param sessionId - Session ID
 * @param afterSeq - Sequence number cuối cùng client đã nhận (lấy events có seq > afterSeq)
 * @returns Array of StoredEvent, sorted by seq ASC
 */
export async function getEventsSince(
  sessionId: string,
  afterSeq: number
): Promise<StoredEvent[]> {
  try {
    const records = await db.workflowEventLog.findMany({
      where: {
        sessionId,
        seq: { gt: afterSeq },
      },
      orderBy: { seq: 'asc' },
    })

    return records.map((r) => ({
      id: r.id,
      sessionId: r.sessionId,
      seq: r.seq,
      type: r.type,
      payload: safeParseJSON(r.payload),
      createdAt: r.createdAt,
    }))
  } catch (err) {
    console.warn(`[EventStore] Failed to query events for session ${sessionId} after seq ${afterSeq}:`, err)
    return []
  }
}

/**
 * Lấy sequence number lớn nhất cho một session.
 * Dùng để biết client đã bỏ lỡ bao nhiêu events.
 *
 * @param sessionId - Session ID
 * @returns Max seq number, hoặc 0 nếu chưa có event nào
 */
export async function getMaxSeq(sessionId: string): Promise<number> {
  return getCurrentSeq(sessionId)
}

/**
 * Xóa cache cho một session (dùng khi session kết thúc).
 */
export function clearSessionCache(sessionId: string): void {
  seqCounters.delete(sessionId)
}

// ==================== HELPERS ====================

function safeParseJSON(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return { raw }
  }
}