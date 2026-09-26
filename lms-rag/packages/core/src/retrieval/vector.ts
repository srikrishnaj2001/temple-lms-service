import { rawSql } from '../db/client.js'

export interface VectorHit {
  id: string
  sourceId: string
  sourceTitle: string
  headingTrail: string[]
  text: string
  /** distance in [0,2] for cosine — smaller is closer */
  distance: number
  courseId: number
  courseTitle?: string
  moduleId?: number
  moduleTitle?: string
}

/**
 * Dense retrieval over rag_chunks. Uses L2-normalised vectors + HNSW cosine ops.
 * Vector is passed as a pgvector literal string.
 *
 * `courseIds` scopes retrieval to the user's enrolled courses. If empty or
 * undefined, retrieval is global (POC default). Callers should always pass
 * a scope in production; API-level default = user's enrolled courses.
 *
 * IMPORTANT: joins into lms-service tables (courses, modules) — those are the
 * canonical title source; RAG doesn't duplicate them.
 */
export async function vectorSearchChunks(
  queryVec: number[],
  limit = 40,
  courseIds?: number[],
  tenantId?: string,
): Promise<VectorHit[]> {
  const sql = rawSql()
  const literal = toPgVectorLiteral(queryVec)
  const scoped = courseIds && courseIds.length > 0
  const tenantScoped = !!tenantId
  const rows = await sql<
    {
      id: string
      source_id: string
      source_title: string
      heading_trail: string[]
      text: string
      distance: number
      course_id: number
      course_title: string | null
      module_id: number | null
      module_title: string | null
    }[]
  >`
    SELECT c.id,
           c."sourceId"    AS source_id,
           s.title         AS source_title,
           c."headingTrail" AS heading_trail,
           c.text,
           c.embedding <=> ${literal}::vector AS distance,
           c."courseId"    AS course_id,
           co.title        AS course_title,
           c."moduleId"    AS module_id,
           m.title         AS module_title
      FROM rag_chunks c
      JOIN rag_sources s ON s.id = c."sourceId"
      LEFT JOIN courses co ON co.id = c."courseId"
      LEFT JOIN modules m  ON m.id = c."moduleId"
     WHERE c.embedding IS NOT NULL
       ${tenantScoped ? sql`AND c."tenantId" = ${tenantId}::uuid` : sql``}
       ${scoped ? sql`AND c."courseId" = ANY(${courseIds as number[]}::int[])` : sql``}
     ORDER BY c.embedding <=> ${literal}::vector
     LIMIT ${limit}
  `
  return rows.map((r) => ({
    id: r.id,
    sourceId: r.source_id,
    sourceTitle: r.source_title,
    headingTrail: r.heading_trail ?? [],
    text: r.text,
    distance: Number(r.distance),
    courseId: Number(r.course_id),
    courseTitle: r.course_title ?? undefined,
    moduleId: r.module_id != null ? Number(r.module_id) : undefined,
    moduleTitle: r.module_title ?? undefined,
  }))
}

export interface VideoCueHit {
  id: string
  videoId: number
  videoTitle: string
  playbackUrl?: string
  cueId: string
  startSec: number
  endSec: number
  text: string
  distance: number
  courseId: number
  courseTitle?: string
  moduleId?: number
  moduleTitle?: string
  /** parent contents.id — used to deep-link into the learner app */
  contentId?: number
}

export async function vectorSearchVideoCues(
  queryVec: number[],
  limit = 20,
  courseIds?: number[],
  tenantId?: string,
): Promise<VideoCueHit[]> {
  const sql = rawSql()
  const literal = toPgVectorLiteral(queryVec)
  const scoped = courseIds && courseIds.length > 0
  const tenantScoped = !!tenantId
  // JOIN rag_sources on the videoId (source.id = 'video:' + videoId) so the caller
  // gets the video title + playbackUrl in one round trip. The frontend needs
  // playbackUrl to render an inline player for watchNext items.
  const rows = await sql<
    {
      id: string
      video_id: number
      cue_id: string
      start_sec: number
      end_sec: number
      text: string
      distance: number
      video_title: string | null
      metadata: { playbackUrl?: string } | null
      course_id: number
      course_title: string | null
      module_id: number | null
      module_title: string | null
      content_id: number | null
    }[]
  >`
    SELECT vc.id,
           vc."videoId"   AS video_id,
           vc."cueId"     AS cue_id,
           vc."startSec"  AS start_sec,
           vc."endSec"    AS end_sec,
           vc.text,
           vc.embedding <=> ${literal}::vector AS distance,
           s.title        AS video_title,
           s.metadata     AS metadata,
           vc."courseId"  AS course_id,
           co.title       AS course_title,
           vc."moduleId"  AS module_id,
           m.title        AS module_title,
           vc."contentId" AS content_id
      FROM rag_video_cues vc
      LEFT JOIN rag_sources s  ON s.id = 'video:' || vc."videoId"::text
      LEFT JOIN courses     co ON co.id = vc."courseId"
      LEFT JOIN modules     m  ON m.id = vc."moduleId"
     WHERE vc.embedding IS NOT NULL
       ${tenantScoped ? sql`AND vc."tenantId" = ${tenantId}::uuid` : sql``}
       ${scoped ? sql`AND vc."courseId" = ANY(${courseIds as number[]}::int[])` : sql``}
     ORDER BY vc.embedding <=> ${literal}::vector
     LIMIT ${limit}
  `
  return rows.map((r) => ({
    id: r.id,
    videoId: Number(r.video_id),
    videoTitle: r.video_title ?? String(r.video_id),
    playbackUrl: r.metadata?.playbackUrl,
    cueId: r.cue_id,
    startSec: r.start_sec,
    endSec: r.end_sec,
    text: r.text,
    distance: Number(r.distance),
    courseId: Number(r.course_id),
    courseTitle: r.course_title ?? undefined,
    moduleId: r.module_id != null ? Number(r.module_id) : undefined,
    moduleTitle: r.module_title ?? undefined,
    contentId: r.content_id != null ? Number(r.content_id) : undefined,
  }))
}

function toPgVectorLiteral(v: number[]): string {
  // pgvector's text input is `[x,y,z]` — must not use bind params for
  // arrays-of-float without server-side vector adapter registration, so we
  // format explicitly and cast in SQL.
  return `[${v.join(',')}]`
}
