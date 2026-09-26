-- 0001_rag_tables.sql
-- Creates the RAG-specific tables in the shared lms-service Postgres.
--
-- lms-service owns: tenants, courses, modules, contents, videos, users, etc.
-- (Sequelize migrations). We do NOT touch those. We only add rag_* tables
-- and reference lms-service tables via FKs with ON DELETE CASCADE so RAG
-- data cleans up automatically when the source content is deleted.
--
-- Column style is camelCase (quoted) to match lms-service conventions.
-- Everything idempotent — safe to re-run.

CREATE EXTENSION IF NOT EXISTS vector;


-- rag_sources ---------------------------------------------------------------
-- One row per ingested document / video. moduleId / contentId / videoId are
-- nullable so a source can be attached at any level (e.g. a course-level
-- syllabus vs. a per-video transcript).
CREATE TABLE IF NOT EXISTS rag_sources (
  id            TEXT PRIMARY KEY,
  "tenantId"    UUID    NOT NULL REFERENCES tenants(id)  ON UPDATE CASCADE ON DELETE RESTRICT,
  "courseId"    INTEGER NOT NULL REFERENCES courses(id)  ON UPDATE CASCADE ON DELETE CASCADE,
  "moduleId"    INTEGER          REFERENCES modules(id)  ON UPDATE CASCADE ON DELETE CASCADE,
  "contentId"   INTEGER          REFERENCES contents(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "videoId"     INTEGER          REFERENCES videos(id)   ON UPDATE CASCADE ON DELETE CASCADE,
  title         TEXT    NOT NULL,
  kind          TEXT    NOT NULL,               -- 'document' | 'video'
  uri           TEXT,
  metadata      JSONB   NOT NULL DEFAULT '{}'::jsonb,
  "contentHash" TEXT    NOT NULL,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rag_sources_course_idx        ON rag_sources ("courseId");
CREATE INDEX IF NOT EXISTS rag_sources_tenant_course_idx ON rag_sources ("tenantId", "courseId");
CREATE INDEX IF NOT EXISTS rag_sources_video_idx         ON rag_sources ("videoId");


-- rag_chunks ---------------------------------------------------------------
-- Text chunks with 1536-d embeddings (Matryoshka-truncated Gemini
-- embedding-001, L2-normalised at write time — cosine distance meaningful
-- only because of that). tsvector is generated so FTS stays in sync.
CREATE TABLE IF NOT EXISTS rag_chunks (
  id             TEXT PRIMARY KEY,               -- ${sourceId}#${ordinal}
  "tenantId"     UUID    NOT NULL REFERENCES tenants(id)     ON UPDATE CASCADE ON DELETE RESTRICT,
  "sourceId"     TEXT    NOT NULL REFERENCES rag_sources(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "courseId"     INTEGER NOT NULL REFERENCES courses(id)     ON UPDATE CASCADE ON DELETE CASCADE,
  "moduleId"     INTEGER          REFERENCES modules(id)     ON UPDATE CASCADE ON DELETE CASCADE,
  ordinal        INTEGER NOT NULL,
  "headingTrail" JSONB   NOT NULL DEFAULT '[]'::jsonb,
  text           TEXT    NOT NULL,
  tokens         INTEGER NOT NULL,
  embedding      VECTOR(1536),
  text_search    TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', COALESCE(text, ''))) STORED,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rag_chunks_source_idx        ON rag_chunks ("sourceId");
CREATE INDEX IF NOT EXISTS rag_chunks_course_idx        ON rag_chunks ("courseId");
CREATE INDEX IF NOT EXISTS rag_chunks_tenant_course_idx ON rag_chunks ("tenantId", "courseId");
CREATE INDEX IF NOT EXISTS rag_chunks_text_search_idx   ON rag_chunks USING GIN (text_search);
CREATE INDEX IF NOT EXISTS rag_chunks_embedding_hnsw_idx
  ON rag_chunks USING hnsw (embedding vector_cosine_ops);


-- rag_video_cues -----------------------------------------------------------
-- One row per VTT cue for a video (retrieval hits corrected text, seek
-- times stay from the source VTT). contentId / moduleId denormalised so the
-- widget can render "from module X" context without extra joins.
CREATE TABLE IF NOT EXISTS rag_video_cues (
  id          TEXT PRIMARY KEY,                  -- ${videoId}#${cueId}
  "tenantId"  UUID    NOT NULL REFERENCES tenants(id)  ON UPDATE CASCADE ON DELETE RESTRICT,
  "videoId"   INTEGER NOT NULL REFERENCES videos(id)   ON UPDATE CASCADE ON DELETE CASCADE,
  "contentId" INTEGER          REFERENCES contents(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "moduleId"  INTEGER          REFERENCES modules(id)  ON UPDATE CASCADE ON DELETE CASCADE,
  "courseId"  INTEGER NOT NULL REFERENCES courses(id)  ON UPDATE CASCADE ON DELETE CASCADE,
  "cueId"     TEXT    NOT NULL,
  "startSec"  INTEGER NOT NULL,
  "endSec"    INTEGER NOT NULL,
  text        TEXT    NOT NULL,
  embedding   VECTOR(1536),
  text_search TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', COALESCE(text, ''))) STORED,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rag_video_cues_video_idx         ON rag_video_cues ("videoId");
CREATE INDEX IF NOT EXISTS rag_video_cues_course_idx        ON rag_video_cues ("courseId");
CREATE INDEX IF NOT EXISTS rag_video_cues_tenant_course_idx ON rag_video_cues ("tenantId", "courseId");
CREATE INDEX IF NOT EXISTS rag_video_cues_text_search_idx   ON rag_video_cues USING GIN (text_search);
CREATE INDEX IF NOT EXISTS rag_video_cues_embedding_hnsw_idx
  ON rag_video_cues USING hnsw (embedding vector_cosine_ops);


-- rag_glossary -------------------------------------------------------------
-- Domain vocabulary + variant spellings for the glossary correction pass
-- and eval checks that glossary terms survive retrieval.
CREATE TABLE IF NOT EXISTS rag_glossary (
  term        TEXT PRIMARY KEY,
  variants    JSONB       NOT NULL DEFAULT '[]'::jsonb,
  definition  TEXT        NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- rag_ingest_jobs ----------------------------------------------------------
-- In-process background job queue backed by Postgres. Admin routes enqueue
-- jobs (e.g. "ingest this video"); a worker on server boot polls this table
-- and processes the oldest pending row.
CREATE TABLE IF NOT EXISTS rag_ingest_jobs (
  id             BIGSERIAL PRIMARY KEY,
  "tenantId"     UUID    NOT NULL REFERENCES tenants(id) ON UPDATE CASCADE ON DELETE CASCADE,
  kind           TEXT    NOT NULL,                -- 'video' | 'text' | 'gumlet-transcript'
  payload        JSONB   NOT NULL,
  status         TEXT    NOT NULL DEFAULT 'pending',
  attempts       INT     NOT NULL DEFAULT 0,
  "maxAttempts"  INT     NOT NULL DEFAULT 3,
  "lastError"    TEXT,
  "lockedUntil"  TIMESTAMPTZ,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rag_ingest_jobs_status_created_idx ON rag_ingest_jobs (status, "createdAt");
CREATE INDEX IF NOT EXISTS rag_ingest_jobs_tenant_created_idx ON rag_ingest_jobs ("tenantId", "createdAt" DESC);
