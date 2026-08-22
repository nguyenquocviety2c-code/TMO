-- ============================================================
-- TMO Memory Backup Tables — Run ONCE in Supabase SQL Editor
-- ============================================================
-- Creates 3 backup tables for the Memory & Learning system:
--   1. agent_memory_backup     (WARM tier — episodic memories)
--   2. memory_archive_backup   (COLD tier — compressed summaries)
--   3. memory_access_log_backup (recall analytics)
--
-- After running this, the app will auto-push on every memory write
-- and auto-pull on startup, so memory persists across sandbox resets.
-- ============================================================

-- 1. agent_memory_backup (WARM tier — matches Prisma AgentMemory model)
CREATE TABLE IF NOT EXISTS public.agent_memory_backup (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  agent_name TEXT NOT NULL DEFAULT 'unknown',
  session_id TEXT,
  category TEXT NOT NULL,                    -- insight | fact | preference | correction | procedure | user_info
  content TEXT NOT NULL,
  context TEXT,
  importance DOUBLE PRECISION DEFAULT 0.5,
  access_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  qdrant_point_id TEXT,                       -- links to Qdrant vector point
  embedding_model TEXT,
  source TEXT DEFAULT 'auto',
  tags TEXT,                                  -- JSON array stringified
  domain TEXT DEFAULT 'work',                 -- user | work | meta
  is_active BOOLEAN DEFAULT true,
  tier TEXT DEFAULT 'warm',                   -- warm | cold
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_am_backup_agent ON public.agent_memory_backup(agent_id);
CREATE INDEX IF NOT EXISTS idx_am_backup_domain ON public.agent_memory_backup(domain);
CREATE INDEX IF NOT EXISTS idx_am_backup_tier ON public.agent_memory_backup(tier);
CREATE INDEX IF NOT EXISTS idx_am_backup_active ON public.agent_memory_backup(is_active);
CREATE INDEX IF NOT EXISTS idx_am_backup_category ON public.agent_memory_backup(category);

-- 2. memory_archive_backup (COLD tier — matches Prisma MemoryArchive model)
CREATE TABLE IF NOT EXISTS public.memory_archive_backup (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  original_ids TEXT NOT NULL,                 -- JSON array of source memory IDs
  summary_content TEXT NOT NULL,             -- LLM-compressed summary
  domain TEXT DEFAULT 'work',
  importance DOUBLE PRECISION DEFAULT 0.3,
  source_count INTEGER DEFAULT 1,
  qdrant_point_id TEXT,
  embedding_model TEXT,
  expires_at TIMESTAMPTZ,                     -- auto-delete after 90 days
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mar_backup_agent ON public.memory_archive_backup(agent_id);
CREATE INDEX IF NOT EXISTS idx_mar_backup_expires ON public.memory_archive_backup(expires_at);

-- 3. memory_access_log_backup (recall analytics — matches Prisma MemoryAccessLog model)
CREATE TABLE IF NOT EXISTS public.memory_access_log_backup (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  session_id TEXT,
  query TEXT,
  relevance DOUBLE PRECISION DEFAULT 0.5,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mal_backup_mem ON public.memory_access_log_backup(memory_id);
CREATE INDEX IF NOT EXISTS idx_mal_backup_agent ON public.memory_access_log_backup(agent_id);
CREATE INDEX IF NOT EXISTS idx_mal_backup_created ON public.memory_access_log_backup(created_at);

-- Enable Row Level Security (service_role bypasses RLS — used by backend)
ALTER TABLE public.agent_memory_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_archive_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_access_log_backup ENABLE ROW LEVEL SECURITY;

-- Grant full access to the service role (backend uses SUPABASE_SERVICE_KEY)
GRANT ALL ON public.agent_memory_backup TO service_role;
GRANT ALL ON public.memory_archive_backup TO service_role;
GRANT ALL ON public.memory_access_log_backup TO service_role;

-- Done! Verify with:
-- SELECT 'agent_memory_backup' AS t, count(*) FROM public.agent_memory_backup
-- UNION ALL SELECT 'memory_archive_backup', count(*) FROM public.memory_archive_backup
-- UNION ALL SELECT 'memory_access_log_backup', count(*) FROM public.memory_access_log_backup;
