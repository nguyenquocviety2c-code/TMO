/**
 * Token Types — SQLite-only token tracker
 *
 * Architecture:
 *   SQLite (buffer) → Qdrant (vector+document) + Neo4j (graph)
 *   Token tracking: In-memory → SQLite only (no remote sync)
 *
 * Rules:
 *   1. READ:  In-memory → SQLite (local only)
 *   2. WRITE: In-memory → SQLite (every 30s)
 *   3. RESET: Clear in-memory and SQLite
 */

// ==================== TYPES ====================

export interface TokenData {
  date: string  // Always "YYYY-MM-DD" format in our app
  tokens: number
  providers: Record<string, number>
  slots: Record<string, Record<number, number>>
  models?: Record<string, Record<string, number>> // Per-provider-per-model token breakdown (optional)
}
