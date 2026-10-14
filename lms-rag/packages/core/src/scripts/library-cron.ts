/**
 * Reading-library cron entry point.
 *
 * Thin wrapper around runLibraryIngest that adds the same advisory-lock
 * discipline as the main LMS content cron (packages/core/src/scripts/
 * ingest-cron.ts) — so overlapping hourly ticks can't step on each other.
 *
 * A separate lock key from INGEST_CRON_LOCK_KEY so a slow library tick
 * never blocks the per-minute LMS content tick (and vice versa).
 */
import { rawSql } from '../db/client.js'
import {
  runLibraryIngest,
  type LibraryIngestSummary,
} from './ingest-reading-library.js'

/** Dedicated advisory lock key for the reading-library cron. */
export const LIBRARY_CRON_LOCK_KEY = 728461074

export interface LibraryCronResult {
  status: 'ok' | 'skipped' | 'error'
  durationMs: number
  summary?: LibraryIngestSummary
  error?: string
}

export async function runLibraryIngestWithLock(): Promise<LibraryCronResult> {
  const sql = rawSql()
  const startedAt = Date.now()

  const lockRows = (await sql`
    SELECT pg_try_advisory_lock(${LIBRARY_CRON_LOCK_KEY}) AS acquired
  `) as unknown as Array<{ acquired: boolean }>
  const acquired = lockRows[0]?.acquired ?? false

  if (!acquired) {
    return { status: 'skipped', durationMs: Date.now() - startedAt }
  }

  try {
    const summary = await runLibraryIngest({ dryRun: false, bookFilter: null })
    return { status: 'ok', durationMs: Date.now() - startedAt, summary }
  } catch (err) {
    return {
      status: 'error',
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    }
  } finally {
    await sql`SELECT pg_advisory_unlock(${LIBRARY_CRON_LOCK_KEY})`
  }
}
