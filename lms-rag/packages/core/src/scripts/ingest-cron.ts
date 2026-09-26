/**
 * Auto-ingest cron entry point (CLI).
 *
 * A thin wrapper around `runIngest` from ingest-lms-content that adds:
 *   - Postgres session advisory lock so overlapping runs cannot corrupt
 *     each other. If the lock is held, exit 0 (benign skip) — cron
 *     platforms treat non-zero as an incident, we don't want to page.
 *   - Single-line JSON summary at the end so Render / Railway log
 *     filters can chart "new courses per hour" easily.
 *
 * The in-process node-cron scheduler (apps/api/src/ingest-cron.ts) uses
 * `runIngestWithLock` from this file so both entry points share the
 * lock + summary logic.
 *
 * CLI usage (rarely needed — the in-process scheduler runs it every 60s):
 *   pnpm --filter @ai-guru/core exec tsx src/scripts/ingest-cron.ts
 */
import { rawSql } from '../db/client.js'
import { runIngest, type IngestSummary } from './ingest-lms-content.js'

/**
 * Arbitrary constant lock key. Postgres advisory locks are namespaced by
 * a signed 32-bit int per session — this one is dedicated to "the lms
 * content ingest cron." Any other job needing its own lock should pick
 * a different value.
 */
export const INGEST_CRON_LOCK_KEY = 728461073

export interface IngestCronResult {
  status: 'ok' | 'skipped' | 'error'
  durationMs: number
  summary?: IngestSummary
  error?: string
}

/**
 * Run the ingest once, guarded by a Postgres advisory lock so overlapping
 * calls (from cron misfires or slow runs) can't step on each other.
 * Does NOT close the DB connection — long-lived callers (the in-process
 * scheduler) want the connection pool kept warm across ticks.
 */
export async function runIngestWithLock(): Promise<IngestCronResult> {
  const sql = rawSql()
  const startedAt = Date.now()

  const lockRows = (await sql`
    SELECT pg_try_advisory_lock(${INGEST_CRON_LOCK_KEY}) AS acquired
  `) as unknown as Array<{ acquired: boolean }>
  const acquired = lockRows[0]?.acquired ?? false

  if (!acquired) {
    return { status: 'skipped', durationMs: Date.now() - startedAt }
  }

  try {
    const summary = await runIngest({
      skipVideos: false,
      skipModules: false,
      skipCourses: false,
      courseFilter: null,
      dryRun: false,
    })
    return { status: 'ok', durationMs: Date.now() - startedAt, summary }
  } catch (err) {
    return {
      status: 'error',
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    }
  } finally {
    await sql`SELECT pg_advisory_unlock(${INGEST_CRON_LOCK_KEY})`
  }
}

async function main(): Promise<void> {
  const result = await runIngestWithLock()

  if (result.status === 'skipped') {
    console.log(
      JSON.stringify({
        event: 'ingest-cron.skipped',
        reason: 'lock-held',
        note: 'previous run still in flight',
      }),
    )
    await rawSql().end()
    return
  }

  if (result.status === 'error') {
    console.error(
      JSON.stringify({
        event: 'ingest-cron.error',
        durationMs: result.durationMs,
        error: result.error,
      }),
    )
    await rawSql().end()
    process.exit(1)
  }

  console.log(
    JSON.stringify({
      event: 'ingest-cron.ok',
      durationMs: result.durationMs,
      summary: result.summary,
    }),
  )
  await rawSql().end()
}

// CLI entry — only runs when invoked directly, not when imported.
const isDirectRun =
  import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` ||
  process.argv[1]?.endsWith('ingest-cron.ts') ||
  process.argv[1]?.endsWith('ingest-cron.js')

if (isDirectRun) {
  main().catch((err) => {
    console.error(
      JSON.stringify({
        event: 'ingest-cron.fatal',
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      }),
    )
    process.exit(1)
  })
}
