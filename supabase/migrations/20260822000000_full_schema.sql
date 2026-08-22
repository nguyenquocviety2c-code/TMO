-- ============================================================
-- TMO Full Schema Migration — Run ONCE in Supabase SQL Editor
-- ============================================================
-- This script:
--   1. Upgrades existing backup tables (add missing columns)
--   2. Creates 7 NEW backup tables (memory archive, access log, personal data, insights)
--
-- PREREQUISITE: None — this is idempotent (safe to re-run)
-- ============================================================

-- ============================================================
-- PART 1: UPGRADE EXISTING TABLES (add missing columns)
-- ============================================================

-- agent_profiles_backup: add 'capable' column (was missing in original schema)
ALTER TABLE public.agent_profiles_backup
  ADD COLUMN IF NOT EXISTS capable TEXT DEFAULT '';

-- agent_memory_backup: add columns for full memory backup (qdrant_point_id, embedding_model, tags, expires_at)
ALTER TABLE public.agent_memory_backup
  ADD COLUMN IF NOT EXISTS qdrant_point_id TEXT,
  ADD COLUMN IF NOT EXISTS embedding_model TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- ============================================================
-- PART 2: CREATE NEW TABLES (7 tables)
-- ============================================================

-- 1. memory_archive_backup (COLD tier — matches Prisma MemoryArchive model)
CREATE TABLE IF NOT EXISTS public.memory_archive_backup (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  original_ids TEXT NOT NULL,
  summary_content TEXT NOT NULL,
  domain TEXT DEFAULT 'work',
  importance DOUBLE PRECISION DEFAULT 0.3,
  source_count INTEGER DEFAULT 1,
  qdrant_point_id TEXT,
  embedding_model TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mar_backup_agent ON public.memory_archive_backup(agent_id);
CREATE INDEX IF NOT EXISTS idx_mar_backup_expires ON public.memory_archive_backup(expires_at);

-- 2. memory_access_log_backup (recall analytics — matches Prisma MemoryAccessLog)
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

-- 3. user_profile_backup (personal data — name, language, preferences, expertise)
CREATE TABLE IF NOT EXISTS public.user_profile_backup (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  source TEXT DEFAULT 'auto',
  confidence DOUBLE PRECISION DEFAULT 0.5,
  access_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_up_backup_user ON public.user_profile_backup(user_id);
CREATE INDEX IF NOT EXISTS idx_up_backup_key ON public.user_profile_backup(key);
CREATE INDEX IF NOT EXISTS idx_up_backup_active ON public.user_profile_backup(is_active);

-- 4. agent_insight_backup (auto-learned insights)
CREATE TABLE IF NOT EXISTS public.agent_insight_backup (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL DEFAULT 'default',
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  type TEXT NOT NULL,
  confidence DOUBLE PRECISION DEFAULT 0.5,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_backup_agent ON public.agent_insight_backup(agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_backup_type ON public.agent_insight_backup(type);
CREATE INDEX IF NOT EXISTS idx_ai_backup_created ON public.agent_insight_backup(created_at);

-- 5. agent_preference_backup (agent-specific preferences)
CREATE TABLE IF NOT EXISTS public.agent_preference_backup (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL DEFAULT 'default',
  preference_key TEXT NOT NULL,
  preference_value TEXT NOT NULL,
  source TEXT DEFAULT 'auto',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ap_backup_agent ON public.agent_preference_backup(agent_id);

-- 6. agent_correction_backup (corrections from feedback)
CREATE TABLE IF NOT EXISTS public.agent_correction_backup (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL DEFAULT 'default',
  wrong_answer TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  reason TEXT,
  applied BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ac_backup_agent ON public.agent_correction_backup(agent_id);
CREATE INDEX IF NOT EXISTS idx_ac_backup_applied ON public.agent_correction_backup(applied);

-- ============================================================
-- PART 3: ENABLE RLS + GRANT (for new tables)
-- ============================================================
ALTER TABLE public.memory_archive_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_access_log_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profile_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_insight_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_preference_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_correction_backup ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.memory_archive_backup TO service_role;
GRANT ALL ON public.memory_access_log_backup TO service_role;
GRANT ALL ON public.user_profile_backup TO service_role;
GRANT ALL ON public.agent_insight_backup TO service_role;
GRANT ALL ON public.agent_preference_backup TO service_role;
GRANT ALL ON public.agent_correction_backup TO service_role;

-- ============================================================
-- DONE! Verify all 12 backup tables exist:
-- ============================================================
-- SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE '%_backup' ORDER BY tablename;
-- Expected: 12 tables (agent_correction_backup, agent_insight_backup, agent_memory_backup,
--   agent_preference_backup, agent_profiles_backup, agent_sessions_backup, agent_skills_backup,
--   chat_messages_backup, knowledge_access_policy_backup, mcp_bridge_config_backup,
--   memory_access_log_backup, memory_archive_backup, token_usage_backup, user_profile_backup)
