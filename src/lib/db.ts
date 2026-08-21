import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  sqlitePragmasApplied: boolean | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// Apply SQLite PRAGMA optimizations once per process
// These run asynchronously — first query will wait for them implicitly
// WAL mode allows concurrent reads during writes (prevents SQLITE_BUSY)
// busy_timeout retries lock acquisition instead of failing immediately
if (!globalForPrisma.sqlitePragmasApplied) {
  globalForPrisma.sqlitePragmasApplied = true
  const applyPragmas = async () => {
    try {
      // Use $queryRawUnsafe for PRAGMAs that return values,
      // $executeRawUnsafe for those that don't return results.
      // SQLite PRAGMA SET statements (with =) don't return rows,
      // but Prisma still sometimes rejects them with $executeRawUnsafe.
      // Safest approach: use $queryRawUnsafe which handles both cases.
      await db.$queryRawUnsafe('PRAGMA journal_mode=WAL')
      await db.$queryRawUnsafe('PRAGMA busy_timeout=5000')
      await db.$queryRawUnsafe('PRAGMA synchronous=NORMAL')
      await db.$queryRawUnsafe('PRAGMA cache_size=-64000')
      await db.$queryRawUnsafe('PRAGMA temp_store=MEMORY')
      console.log('[DB] SQLite PRAGMAs applied: WAL, busy_timeout=5000, synchronous=NORMAL, cache_size=64MB, temp_store=MEMORY')
    } catch (err) {
      console.warn('[DB] SQLite PRAGMA setup error (non-critical):', err instanceof Error ? err.message : String(err))
    }
  }
  applyPragmas()
}
