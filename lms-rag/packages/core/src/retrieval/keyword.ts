import { rawSql } from '../db/client.js'

/**
 * Keyword lane for hybrid retrieval — Postgres tsvector.
 *
 * `rag_chunks.text_search` and `rag_video_cues.text_search` are `GENERATED
 * ALWAYS AS (to_tsvector('english', text)) STORED` columns backed by GIN
 * indexes (see 0001_rag_tables.sql), so there is nothing to index on the
 * application side — writes to `text` keep the vector current automatically.
 * Note: the tsvector column is `text_search` (snake_case) because it's a
 * Postgres-generated column, not one we chose the name of.
 */

export interface KeywordHit {
  id: string
  sourceId?: string
  sourceTitle?: string
  headingTrail?: string[]
  text: string
  videoId?: number
  startSec?: number
  endSec?: number
  /** ts_rank_cd score (higher = better; RRF fusion uses rank position anyway) */
  score: number
}

export async function keywordSearchChunks(
  query: string,
  limit = 40,
  courseIds?: number[],
  tenantId?: string,
): Promise<KeywordHit[]> {
  const sql = rawSql()
  const scoped = courseIds && courseIds.length > 0
  const tenantScoped = !!tenantId
  // websearch_to_tsquery accepts natural-language input: bare words are ANDed;
  // quoted phrases match adjacency; OR / - are respected. Safer than the raw
  // to_tsquery which throws on bad input.
  const rows = await sql<
    {
      id: string
      source_id: string
      source_title: string
      heading_trail: string[]
      text: string
      score: number
    }[]
  >`
    SELECT c.id,
           c."sourceId"     AS source_id,
           s.title          AS source_title,
           c."headingTrail" AS heading_trail,
           c.text,
           ts_rank_cd(c.text_search, websearch_to_tsquery('english', ${query})) AS score
      FROM rag_chunks c
      JOIN rag_sources s ON s.id = c."sourceId"
     WHERE c.text_search @@ websearch_to_tsquery('english', ${query})
       ${tenantScoped ? sql`AND c."tenantId" = ${tenantId}::uuid` : sql``}
       ${scoped ? sql`AND c."courseId" = ANY(${courseIds as number[]}::int[])` : sql``}
     ORDER BY score DESC
     LIMIT ${limit}
  `
  return rows.map((r) => ({
    id: r.id,
    sourceId: r.source_id,
    sourceTitle: r.source_title,
    headingTrail: r.heading_trail ?? [],
    text: r.text,
    score: Number(r.score),
  }))
}

export async function keywordSearchVideoCues(
  query: string,
  limit = 20,
  courseIds?: number[],
  tenantId?: string,
): Promise<KeywordHit[]> {
  const sql = rawSql()
  const scoped = courseIds && courseIds.length > 0
  const tenantScoped = !!tenantId
  const rows = await sql<
    {
      id: string
      video_id: number
      start_sec: number
      end_sec: number
      text: string
      score: number
    }[]
  >`
    SELECT vc.id,
           vc."videoId"  AS video_id,
           vc."startSec" AS start_sec,
           vc."endSec"   AS end_sec,
           vc.text,
           ts_rank_cd(vc.text_search, websearch_to_tsquery('english', ${query})) AS score
      FROM rag_video_cues vc
     WHERE vc.text_search @@ websearch_to_tsquery('english', ${query})
       ${tenantScoped ? sql`AND vc."tenantId" = ${tenantId}::uuid` : sql``}
       ${scoped ? sql`AND vc."courseId" = ANY(${courseIds as number[]}::int[])` : sql``}
     ORDER BY score DESC
     LIMIT ${limit}
  `
  return rows.map((r) => ({
    id: r.id,
    text: r.text,
    videoId: Number(r.video_id),
    startSec: r.start_sec,
    endSec: r.end_sec,
    score: Number(r.score),
  }))
}
