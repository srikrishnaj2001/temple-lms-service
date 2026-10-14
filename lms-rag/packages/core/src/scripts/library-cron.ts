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

  // Transaction locks stay on one connection, even behind a transaction pooler.
  try {
    return await sql.begin(async (tx) => {
      const rows = await tx`SELECT pg_try_advisory_xact_lock(${LIBRARY_CRON_LOCK_KEY}) AS acquired`
      if (!rows[0]?.acquired) {
        return { status: 'skipped' as const, durationMs: Date.now() - startedAt }
      }
      const summary = await runLibraryIngest({ dryRun: false, bookFilter: null })
      return { status: 'ok' as const, durationMs: Date.now() - startedAt, summary }
    })
  } catch (err) {
    return {
      status: 'error',
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    }
  }
}
