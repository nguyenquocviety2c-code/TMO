-- ============================================================
-- Migration: Add Document + LocalEntity + LocalRelationship +
--            LocalResolvedEntity backup tables to Supabase
-- ============================================================
-- Purpose: Persist document processing state to the Supabase cloud so
--          it survives sandbox resets. Previously only chat/agent tables
--          were backed up — Document, LocalEntity, LocalRelationship,
--          LocalResolvedEntity, and JobQueue were absent.
--
-- After applying: src/lib/supabase-sync.ts pushToSupabase() will upsert
--                 rows from these 4 SQLite tables into the new *_backup
--                 tables, and pullFromSupabase() will restore them.
--
-- Schema mirrors prisma/schema.prisma models exactly.
-- ============================================================

-- 1. Document — processing status, %, steps, page count, domain
CREATE TABLE IF NOT EXISTS documents_backup (
  id                  TEXT PRIMARY KEY,
  title               TEXT NOT NULL,
  file_path           TEXT DEFAULT '',
  domain              TEXT DEFAULT 'mixed',
  page_count          INTEGER,
  status              TEXT DEFAULT 'uploaded',
  error_message       TEXT,
  user_paused         BOOLEAN DEFAULT FALSE,
  processing_steps    TEXT DEFAULT '[]',
  processing_percent INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_documents_backup_status ON documents_backup (status);
CREATE INDEX IF NOT EXISTS idx_documents_backup_domain ON documents_backup (domain);
COMMENT ON TABLE documents_backup IS 'Cloud backup of SQLite Document table — document processing state';

-- 2. LocalEntity — extracted entities buffer (synced to Neo4j)
CREATE TABLE IF NOT EXISTS local_entities_backup (
  id                  TEXT PRIMARY KEY,
  document_id         TEXT,
  chunk_id            TEXT,
  entity_name         TEXT NOT NULL,
  entity_type         TEXT NOT NULL,
  description         TEXT,
  properties          TEXT,
  confidence_score    REAL DEFAULT 0.5,
  source              TEXT DEFAULT 'unknown',
  domain              TEXT,
  resolved_entity_id  TEXT,
  synced              BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_local_entities_backup_doc ON local_entities_backup (document_id);
CREATE INDEX IF NOT EXISTS idx_local_entities_backup_name ON local_entities_backup (entity_name);
CREATE INDEX IF NOT EXISTS idx_local_entities_backup_type ON local_entities_backup (entity_type);
CREATE INDEX IF NOT EXISTS idx_local_entities_backup_synced ON local_entities_backup (synced);
COMMENT ON TABLE local_entities_backup IS 'Cloud backup of SQLite LocalEntity table — extracted entities buffer';

-- 3. LocalRelationship — extracted relationships buffer (synced to Neo4j)
CREATE TABLE IF NOT EXISTS local_relationships_backup (
  id                  TEXT PRIMARY KEY,
  document_id         TEXT,
  source_entity_id    TEXT,
  target_entity_id    TEXT,
  source_entity_name  TEXT,
  target_entity_name  TEXT,
  relationship_type   TEXT NOT NULL,
  description         TEXT,
  confidence_score    REAL DEFAULT 0.5,
  source              TEXT DEFAULT 'unknown',
  synced              BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_local_relationships_backup_doc ON local_relationships_backup (document_id);
CREATE INDEX IF NOT EXISTS idx_local_relationships_backup_type ON local_relationships_backup (relationship_type);
CREATE INDEX IF NOT EXISTS idx_local_relationships_backup_synced ON local_relationships_backup (synced);
COMMENT ON TABLE local_relationships_backup IS 'Cloud backup of SQLite LocalRelationship table — extracted relationships buffer';

-- 4. LocalResolvedEntity — canonical merged entities (post-resolution)
CREATE TABLE IF NOT EXISTS local_resolved_entities_backup (
  id                TEXT PRIMARY KEY,
  document_id       TEXT,
  canonical_name    TEXT NOT NULL UNIQUE,
  entity_type       TEXT NOT NULL,
  description       TEXT,
  properties        TEXT,
  avg_confidence    REAL DEFAULT 0.5,
  occurrence_count  INTEGER DEFAULT 1,
  domains           TEXT,
  synced            BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_local_resolved_entities_backup_doc ON local_resolved_entities_backup (document_id);
CREATE INDEX IF NOT EXISTS idx_local_resolved_entities_backup_synced ON local_resolved_entities_backup (synced);
COMMENT ON TABLE local_resolved_entities_backup IS 'Cloud backup of SQLite LocalResolvedEntity table — canonical merged entities';
