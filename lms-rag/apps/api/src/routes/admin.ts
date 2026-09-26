import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { queue } from '@ai-guru/core'
import { DEV_TENANT_ID, rawSql } from '@ai-guru/core/db'

/**
 * Admin API — enqueues ingest jobs against content owned by lms-service.
 *
 * Course/chapter CRUD used to live here (and in a sibling `courses.ts` route)
 * back when RAG owned those tables. That's gone now: courses, modules, and
 * contents are all managed by lms-service, and this API only writes to the
 * `rag_*` tables. This route just enqueues background jobs that pull content
 * by lms-service id.
 *
 *   PUT /admin/modules/:moduleId/text          → ingest text for a module
 *   PUT /admin/modules/:moduleId/video         → attach a video (VTT + playbackUrl)
 *   PUT /admin/modules/:moduleId/video-from-gumlet → fetch VTT from Gumlet
 *   GET /admin/jobs                            → list recent jobs (this tenant)
 *   GET /admin/jobs/:jobId                     → poll a specific job
 *
 * All routes gated by ADMIN_TOKEN via admin-auth hook (see server.ts).
 */

const PutTextBody = z.object({
  /** stable id for the source row; e.g. `module:${moduleId}:body` */
  sourceId: z.string().min(1).max(200),
  courseId: z.number().int().positive(),
  contentId: z.number().int().positive().optional(),
  title: z.string().min(1).max(200),
  text: z.string().min(1).max(1_000_000),
})

const PutVideoBody = z.object({
  videoId: z.number().int().positive(),
  courseId: z.number().int().positive(),
  contentId: z.number().int().positive().optional(),
  title: z.string().min(1).max(200),
  playbackUrl: z.string().url().optional(),
  /**
   * Subtitle text — WebVTT OR SubRip (SRT). Format is auto-detected; pass
   * `format` to skip detection when you already know. Gumlet returns both;
   * WebVTT is preferred (has cue ids we use), SRT is accepted as-is.
   */
  vtt: z.string().min(1),
  format: z.enum(['vtt', 'srt']).optional(),
})

const PutGumletVideoBody = z.object({
  videoId: z.number().int().positive(),
  courseId: z.number().int().positive(),
  contentId: z.number().int().positive().optional(),
  title: z.string().min(1).max(200),
  gumletAssetId: z.string().min(1).max(120),
  playbackUrl: z.string().url().optional(),
  languagePref: z.string().max(10).optional(),
})

/** Tenant scoping. Prefer the JWT if available; else fall back to DEV_TENANT_ID. */
function tenantOf(req: import('fastify').FastifyRequest): string {
  return req.learner?.tenantId ?? DEV_TENANT_ID
}

/**
 * Look up a module in lms-service by id. Returns the courseId so callers can
 * scope their ingest job correctly. Returns undefined if the module doesn't
 * exist (or is soft-deleted).
 */
async function getModuleCourseId(moduleId: number): Promise<{ courseId: number; title: string } | undefined> {
  const sql = rawSql()
  const rows = await sql<{ courseId: number; title: string }[]>`
    SELECT "courseId", title
      FROM modules
     WHERE id = ${moduleId}
       AND "deletedAt" IS NULL
     LIMIT 1
  `
  const r = rows[0]
  if (!r) return undefined
  return { courseId: Number(r.courseId), title: r.title }
}

export async function adminRoute(app: FastifyInstance) {
  // Chapter/course CRUD is intentionally NOT here — that content is owned
  // by lms-service. Attempting the old endpoints returns 410.
  const gone = async (_req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => {
    reply.code(410).send({
      error: 'gone',
      message: 'course/chapter CRUD is now owned by lms-service; call its endpoints instead',
    })
  }
  app.post('/admin/courses', gone)
  app.get('/admin/courses/:cid/chapters', gone)
  app.post('/admin/courses/:cid/chapters', gone)
  app.delete('/admin/chapters/:chid', gone)
  app.put('/admin/chapters/:chid/text', gone)
  app.put('/admin/chapters/:chid/video', gone)
  app.put('/admin/chapters/:chid/video-from-gumlet', gone)

  // Text ingest — enqueues a background job instead of running synchronously
  // so the LMS admin sees an instant 202 (with jobId) instead of blocking
  // through chunking + embedding + insert. Poll `/admin/jobs/:id` for status.
  app.put('/admin/modules/:moduleId/text', async (req, reply) => {
    const { moduleId } = req.params as { moduleId: string }
    const mid = Number(moduleId)
    if (!Number.isFinite(mid)) return reply.code(400).send({ error: 'moduleId must be an integer' })
    const body = PutTextBody.parse(req.body)
    const mod = await getModuleCourseId(mid)
    if (!mod) return reply.code(404).send({ error: 'module not found' })
    const jobId = await queue.enqueue({
      kind: 'text',
      tenantId: tenantOf(req),
      payload: {
        sourceId: body.sourceId,
        courseId: body.courseId,
        moduleId: mid,
        contentId: body.contentId,
        title: body.title,
        text: body.text,
      },
    })
    reply.code(202).send({ jobId, status: 'queued' })
  })

  // Video ingest — same async pattern as text. Caller supplies VTT directly
  // (useful when the LMS has already fetched from Gumlet).
  app.put('/admin/modules/:moduleId/video', async (req, reply) => {
    const { moduleId } = req.params as { moduleId: string }
    const mid = Number(moduleId)
    if (!Number.isFinite(mid)) return reply.code(400).send({ error: 'moduleId must be an integer' })
    const body = PutVideoBody.parse(req.body)
    const mod = await getModuleCourseId(mid)
    if (!mod) return reply.code(404).send({ error: 'module not found' })
    const jobId = await queue.enqueue({
      kind: 'video',
      tenantId: tenantOf(req),
      payload: {
        videoId: body.videoId,
        courseId: body.courseId,
        moduleId: mid,
        contentId: body.contentId,
        title: body.title,
        vtt: body.vtt,
        format: body.format,
        playbackUrl: body.playbackUrl,
      },
    })
    reply.code(202).send({ jobId, status: 'queued' })
  })

  // Gumlet-transcript ingest — the LMS just gives us the Gumlet asset id,
  // the worker fetches the subtitle track and processes it. This is the
  // "new video → background job" trigger from the spec.
  app.put('/admin/modules/:moduleId/video-from-gumlet', async (req, reply) => {
    const { moduleId } = req.params as { moduleId: string }
    const mid = Number(moduleId)
    if (!Number.isFinite(mid)) return reply.code(400).send({ error: 'moduleId must be an integer' })
    const body = PutGumletVideoBody.parse(req.body)
    const mod = await getModuleCourseId(mid)
    if (!mod) return reply.code(404).send({ error: 'module not found' })
    const jobId = await queue.enqueue({
      kind: 'gumlet-transcript',
      tenantId: tenantOf(req),
      payload: {
        videoId: body.videoId,
        courseId: body.courseId,
        moduleId: mid,
        contentId: body.contentId,
        title: body.title,
        gumletAssetId: body.gumletAssetId,
        languagePref: body.languagePref,
        playbackUrl: body.playbackUrl,
      },
    })
    reply.code(202).send({ jobId, status: 'queued' })
  })

  // Job status polling (admin dashboards, backfill scripts).
  app.get('/admin/jobs/:jobId', async (req, reply) => {
    const { jobId } = req.params as { jobId: string }
    const job = await queue.getJob(jobId)
    if (!job) return reply.code(404).send({ error: 'job not found' })
    reply.send(job)
  })

  app.get('/admin/jobs', async (req) => {
    const jobs = await queue.listRecentJobs(tenantOf(req))
    return { jobs }
  })
}
