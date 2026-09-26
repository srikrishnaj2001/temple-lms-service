import nodeCron from 'node-cron'
import type { FastifyBaseLogger } from 'fastify'
import { cron } from '@ai-guru/core'

/**
 * In-process auto-ingest scheduler.
 *
 * Every 60 seconds, pulls fresh course/module/video rows from the
 * lms-service tables and re-runs the RAG ingest for anything new or
 * changed. Because ingest is content-hash idempotent, most ticks are
 * ~1-2 seconds of "nothing to do" — only ticks where an admin actually
 * created or edited content pay the Gemini embed cost.
 *
 * A Postgres advisory lock (managed inside runIngestWithLock) guarantees
 * that overlapping ticks — e.g. a slow embed run during a burst of new
 * content — cannot step on each other.
 *
 * Toggle with env INGEST_CRON_DISABLED=1 to run without auto-ingest
 * (useful for maintenance windows or when scaling to multiple replicas
 * — the cron only needs to fire from one node).
 */
export function startIngestCron(log: FastifyBaseLogger): void {
  if (process.env.INGEST_CRON_DISABLED === '1') {
    log.info({ event: 'ingest-cron.disabled' }, 'INGEST_CRON_DISABLED=1 — auto-ingest scheduler NOT started')
    return
  }

  const schedule = process.env.INGEST_CRON_SCHEDULE ?? '* * * * *' // every minute

  nodeCron.schedule(schedule, async () => {
    try {
      const result = await cron.runIngestWithLock()
      if (result.status === 'skipped') {
        log.debug({ event: 'ingest-cron.skipped', reason: 'lock-held' }, 'previous ingest still running, skipping tick')
        return
      }
      if (result.status === 'error') {
        log.error(
          { event: 'ingest-cron.error', durationMs: result.durationMs, err: result.error },
          'ingest tick failed',
        )
        return
      }
      // Only log ticks that actually did work — a healthy idle tick
      // shouldn't flood the log every minute.
      const s = result.summary!
      const didWork =
        s.courses.ingested > 0 || s.modules.ingested > 0 || s.videos.ingested > 0
      if (didWork) {
        log.info(
          {
            event: 'ingest-cron.ok',
            durationMs: result.durationMs,
            courses: s.courses.ingested,
            modules: s.modules.ingested,
            videos: s.videos.ingested,
          },
          'ingested new content',
        )
      } else {
        log.debug({ event: 'ingest-cron.ok', durationMs: result.durationMs }, 'no new content')
      }
    } catch (err) {
      log.error(
        { event: 'ingest-cron.fatal', err: err instanceof Error ? err.message : String(err) },
        'unhandled error in ingest cron tick',
      )
    }
  })

  log.info({ event: 'ingest-cron.started', schedule }, 'auto-ingest scheduler running')
}
