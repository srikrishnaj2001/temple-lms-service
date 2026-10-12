-- 0004_library_sources.sql
-- Reading-library content doesn't belong to any one tenant or course — it's
-- public, shared content fetched from templeinfo.org. To avoid injecting
-- ghost rows into tenants/courses (which would leak into admin UI), make
-- rag_sources + rag_chunks accept NULL for tenantId + courseId when
-- kind = 'library'.
--
-- Existing (non-library) rows always have both set — no backfill needed.
-- The nullability change is purely permissive; existing retrieval queries
-- that filter by tenantId / courseId continue to work (NULL simply never
-- matches an equality filter), and the new "OR kind = 'library'" branch
-- in retrieval admits library chunks regardless of scope.

ALTER TABLE rag_sources
  ALTER COLUMN "tenantId" DROP NOT NULL,
  ALTER COLUMN "courseId" DROP NOT NULL;

ALTER TABLE rag_chunks
  ALTER COLUMN "tenantId" DROP NOT NULL,
  ALTER COLUMN "courseId" DROP NOT NULL;
