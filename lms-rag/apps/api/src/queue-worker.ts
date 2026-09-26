import type { FastifyBaseLogger } from 'fastify'
import { queue, ingest, glossary } from '@ai-guru/core'

/**
 * Register the ingest job handlers and start the worker loop on server boot.
 *
 * Handler payload shapes:
 *
 *   kind 'text' — { sourceId, courseId, moduleId?, contentId?, title, text }
 *   kind 'video' — { videoId, courseId, moduleId?, contentId?, title, vtt, format?, playbackUrl? }
 *   kind 'gumlet-transcript' — { videoId, courseId, moduleId?, contentId?, title,
 *                                gumletAssetId, languagePref?, playbackUrl? }
 *
 * All three carry `tenantId` on the job row (top-level, not payload) — handlers
 * pull that from `job.tenantId` so a payload can never override tenant scope.
 */
export function startIngestQueue(log: FastifyBaseLogger): void {
  const glossaryPromise = loadGlossaryOrEmpty(log)

  queue.registerHandler<{
    sourceId: string
    courseId: number
    moduleId?: number
    contentId?: number
    title: string
    text: string
  }>('text', async (job) => {
    await ingest.ingestText(
      {
        sourceId: job.payload.sourceId,
        courseId: job.payload.courseId,
        moduleId: job.payload.moduleId,
        contentId: job.payload.contentId,
        title: job.payload.title,
        text: job.payload.text,
      },
      { tenantId: job.tenantId },
    )
  })

  queue.registerHandler<{
    videoId: number
    courseId: number
    moduleId?: number
    contentId?: number
    title: string
    vtt: string
    format?: 'vtt' | 'srt'
    playbackUrl?: string
  }>('video', async (job) => {
    const g = await glossaryPromise
    await ingest.ingestVideoFromPayload(
      {
        videoId: job.payload.videoId,
        title: job.payload.title,
        vtt: job.payload.vtt,
        format: job.payload.format,
        playbackUrl: job.payload.playbackUrl,
      },
      g,
      {
        tenantId: job.tenantId,
        courseId: job.payload.courseId,
        moduleId: job.payload.moduleId,
        contentId: job.payload.contentId,
        playbackUrl: job.payload.playbackUrl,
        skipCorrection: process.env.INGEST_CORRECT_VIDEOS !== 'true',
      },
    )
  })

  queue.registerHandler<{
    videoId: number
    courseId: number
    moduleId?: number
    contentId?: number
    title: string
    gumletAssetId: string
    languagePref?: string
    playbackUrl?: string
  }>('gumlet-transcript', async (job) => {
    const g = await glossaryPromise
    await ingest.ingestVideoFromGumlet(
      {
        videoId: job.payload.videoId,
        title: job.payload.title,
        gumletAssetId: job.payload.gumletAssetId,
        languagePref: job.payload.languagePref,
        playbackUrl: job.payload.playbackUrl,
      },
      g,
      {
        tenantId: job.tenantId,
        courseId: job.payload.courseId,
        moduleId: job.payload.moduleId,
        contentId: job.payload.contentId,
        playbackUrl: job.payload.playbackUrl,
        skipCorrection: process.env.INGEST_CORRECT_VIDEOS !== 'true',
      },
    )
  })

  queue.startWorker({
    pollIntervalMs: Number(process.env.INGEST_POLL_MS ?? '3000'),
    batchSize: Number(process.env.INGEST_BATCH_SIZE ?? '1'),
    onLog: (level, msg, meta) => {
      if (level === 'error') log.error(meta, msg)
      else if (level === 'warn') log.warn(meta, msg)
      else log.info(meta, msg)
    },
  })
}

async function loadGlossaryOrEmpty(log: FastifyBaseLogger): Promise<glossary.Glossary> {
  try {
    return await glossary.loadGlossary(
      process.env.GLOSSARY_PATH ?? 'fixtures/glossary/glossary.example.json',
    )
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'no glossary loaded — ingest will skip term correction')
    return []
  }
}
