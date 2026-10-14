import nodeCron from 'node-cron'
import type { FastifyBaseLogger } from 'fastify'
import { cron, libraryCron } from '@ai-guru/core'

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

/**
 * In-process reading-library auto-ingest scheduler.
 *
 * Pulls the public catalogue from templeinfo.org (74 books ≈ 15 MB total)
 * and upserts them into the RAG index so AI Guru and search can ground on
 * book content. Content-hash dedup makes unchanged pages free on re-run;
 * the first full pass costs ~$0.20 in embed credits.
 *
 * Hourly by default — editorial pace is slow (books don't change every
 * minute) and the catalogue fetch is 74+ HTTP round trips. Tunable via
 * LIBRARY_INGEST_CRON_SCHEDULE. Disable with LIBRARY_INGEST_CRON_DISABLED=1.
 *
 * Advisory-lock keyed independently from the LMS content cron, so a slow
 * library tick never blocks the per-minute LMS cron (and vice versa).
 */
export function startLibraryIngestCron(log: FastifyBaseLogger): void {
  if (process.env.LIBRARY_INGEST_CRON_DISABLED === '1') {
    log.info(
      { event: 'library-ingest-cron.disabled' },
      'LIBRARY_INGEST_CRON_DISABLED=1 — reading-library auto-ingest NOT started',
    )
    return
  }

  const schedule = process.env.LIBRARY_INGEST_CRON_SCHEDULE ?? '0 * * * *' // top of every hour

  nodeCron.schedule(schedule, async () => {
    try {
      const result = await libraryCron.runLibraryIngestWithLock()
      if (result.status === 'skipped') {
        log.debug(
          { event: 'library-ingest-cron.skipped', reason: 'lock-held' },
          'previous library ingest still running, skipping tick',
        )
        return
      }
      if (result.status === 'error') {
        log.error(
          { event: 'library-ingest-cron.error', durationMs: result.durationMs, err: result.error },
          'library ingest tick failed',
        )
        return
      }
      const s = result.summary!
      const didWork = s.pagesIngested > 0
      if (didWork) {
        log.info(
          {
            event: 'library-ingest-cron.ok',
            durationMs: result.durationMs,
            totalBooks: s.totalBooks,
            booksProcessed: s.booksProcessed,
            pagesIngested: s.pagesIngested,
            chunksIngested: s.chunksIngested,
            errors: s.errors.length,
          },
          'ingested reading-library content',
        )
      } else {
        log.debug(
          {
            event: 'library-ingest-cron.ok',
            durationMs: result.durationMs,
            totalBooks: s.totalBooks,
          },
          'no library content changes',
        )
      }
    } catch (err) {
      log.error(
        { event: 'library-ingest-cron.fatal', err: err instanceof Error ? err.message : String(err) },
        'unhandled error in library ingest cron tick',
      )
    }
  })

  log.info({ event: 'library-ingest-cron.started', schedule }, 'reading-library auto-ingest scheduler running')
}
