-- ============================================================
-- TMO Personal Data + Insights Backup Tables — Run ONCE in Supabase SQL Editor
-- ============================================================
-- Creates 4 NEW backup tables for personal data + agent learning:
--   1. user_profile_backup      (name, language, preferences, expertise)
--   2. agent_insight_backup     (auto-learned insights)
--   3. agent_preference_backup  (agent-specific preferences)
--   4. agent_correction_backup (corrections from user feedback)
--
-- After running this, the app auto-pushes on every write and auto-pulls
-- on startup, so personal data + insights persist across sandbox resets.
--
-- PREREQUISITE: Already ran supabase-memory-tables.sql (3 memory tables)
-- ============================================================

-- 1. user_profile_backup (personal data — matches Prisma UserProfile model)
CREATE TABLE IF NOT EXISTS public.user_profile_backup (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  key TEXT NOT NULL,                          -- name | language | role | expertise | preference_xxx
  value TEXT NOT NULL,
  source TEXT DEFAULT 'auto',                 -- auto | manual | agent_observation
  confidence DOUBLE PRECISION DEFAULT 0.5,
  access_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_up_backup_user ON public.user_profile_backup(user_id);
CREATE INDEX IF NOT EXISTS idx_up_backup_key ON public.user_profile_backup(key);
CREATE INDEX IF NOT EXISTS idx_up_backup_active ON public.user_profile_backup(is_active);

-- 2. agent_insight_backup (auto-learned insights — matches Prisma AgentInsight model)
CREATE TABLE IF NOT EXISTS public.agent_insight_backup (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL DEFAULT 'default',
  content TEXT NOT NULL,
  source TEXT NOT NULL,                      -- auto | manual | feedback | correction
  type TEXT NOT NULL,                          -- factual | procedural | preference | pattern
  confidence DOUBLE PRECISION DEFAULT 0.5,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_backup_agent ON public.agent_insight_backup(agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_backup_type ON public.agent_insight_backup(type);
CREATE INDEX IF NOT EXISTS idx_ai_backup_created ON public.agent_insight_backup(created_at);

-- 3. agent_preference_backup (agent-specific preferences — matches Prisma AgentPreference)
CREATE TABLE IF NOT EXISTS public.agent_preference_backup (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL DEFAULT 'default',
  preference_key TEXT NOT NULL,
  preference_value TEXT NOT NULL,
  source TEXT DEFAULT 'auto',                 -- auto | manual | feedback
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ap_backup_agent ON public.agent_preference_backup(agent_id);

-- 4. agent_correction_backup (corrections from feedback — matches Prisma AgentCorrection)
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

-- Enable Row Level Security (service_role bypasses RLS)
ALTER TABLE public.user_profile_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_insight_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_preference_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_correction_backup ENABLE ROW LEVEL SECURITY;

-- Grant full access to the service role (backend uses SUPABASE_SERVICE_KEY)
GRANT ALL ON public.user_profile_backup TO service_role;
GRANT ALL ON public.agent_insight_backup TO service_role;
GRANT ALL ON public.agent_preference_backup TO service_role;
GRANT ALL ON public.agent_correction_backup TO service_role;

-- Done! Verify with:
-- SELECT 'user_profile_backup' AS t, count(*) FROM public.user_profile_backup
-- UNION ALL SELECT 'agent_insight_backup', count(*) FROM public.agent_insight_backup
-- UNION ALL SELECT 'agent_preference_backup', count(*) FROM public.agent_preference_backup
-- UNION ALL SELECT 'agent_correction_backup', count(*) FROM public.agent_correction_backup;
