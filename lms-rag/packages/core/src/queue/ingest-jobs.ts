import { rawSql } from '../db/client.js'

/**
 * In-process ingest job queue backed by Postgres.
 *
 * Design principles:
 *   - No Redis. The LMS already runs Postgres — reuse it.
 *   - `SELECT ... FOR UPDATE SKIP LOCKED` gives us worker safety even if
 *     multiple API instances run the worker loop in parallel.
 *   - Retries with capped exponential backoff (via `lockedUntil`).
 *   - Never lose a job: crashes leave a row in 'running' with
 *     `lockedUntil` in the past → another worker (or the same one after
 *     restart) picks it up on the next poll.
 *
 * When you outgrow this (throughput > ~10 jobs/sec, or you want per-tenant
 * fair scheduling), swap in BullMQ+Redis. The public API here (`enqueue`,
 * `startWorker`) doesn't change.
 */

export type JobKind = 'video' | 'text' | 'gumlet-transcript'
export type JobStatus = 'pending' | 'running' | 'done' | 'failed'

export interface JobRow<P = Record<string, unknown>> {
  id: string
  tenantId: string
  kind: JobKind
  payload: P
  status: JobStatus
  attempts: number
  maxAttempts: number
  lastError: string | null
  createdAt: Date
}

export interface EnqueueArgs<P = Record<string, unknown>> {
  kind: JobKind
  payload: P
  tenantId: string
  maxAttempts?: number
}

/** Insert a new job into the queue. Returns the row's id. */
export async function enqueue<P>(args: EnqueueArgs<P>): Promise<string> {
  const s = rawSql()
  const rows = await s<{ id: string }[]>`
    INSERT INTO rag_ingest_jobs ("tenantId", kind, payload, "maxAttempts")
    VALUES (${args.tenantId}::uuid, ${args.kind}, ${JSON.stringify(args.payload)}::jsonb, ${args.maxAttempts ?? 3})
    RETURNING id::text AS id
  `
  return rows[0]!.id
}

/** Look up a specific job (for polling from an admin dashboard). */
export async function getJob(id: string): Promise<JobRow | null> {
  const s = rawSql()
  const rows = await s<JobRow[]>`
    SELECT id::text AS id,
           "tenantId"::text AS "tenantId",
           kind,
           payload,
           status,
           attempts,
           "maxAttempts",
           "lastError",
           "createdAt"
      FROM rag_ingest_jobs
     WHERE id = ${id}::bigint
  `
  return rows[0] ?? null
}

/** Recent jobs for a tenant — for admin visibility. */
export async function listRecentJobs(tenantId: string, limit = 50): Promise<JobRow[]> {
  const s = rawSql()
  const rows = await s<JobRow[]>`
    SELECT id::text AS id,
           "tenantId"::text AS "tenantId",
           kind,
           payload,
           status,
           attempts,
           "maxAttempts",
           "lastError",
           "createdAt"
      FROM rag_ingest_jobs
     WHERE "tenantId" = ${tenantId}::uuid
     ORDER BY "createdAt" DESC
     LIMIT ${limit}
  `
  return rows
}

// -----------------------------------------------------------------------------
// Worker
// -----------------------------------------------------------------------------

/** How a specific job kind is processed. Register via `registerHandler`. */
export type JobHandler<P = Record<string, unknown>> = (
  job: JobRow<P>,
) => Promise<void>

const handlers = new Map<JobKind, JobHandler>()

export function registerHandler<P>(kind: JobKind, handler: JobHandler<P>): void {
  handlers.set(kind, handler as JobHandler)
}

export interface WorkerOptions {
  /** How often to poll for new jobs when the queue is empty (ms). Default 3000. */
  pollIntervalMs?: number
  /** Cap on how many jobs a single tick pulls (prevents a big backlog blocking others). Default 1. */
  batchSize?: number
  /** Hook for logging — receives structured events instead of console.log. */
  onLog?: (level: 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>) => void
}

let workerHandle: NodeJS.Timeout | undefined
let workerStopping = false

/**
 * Start the background worker. Idempotent — calling twice does nothing.
 * Call this once from your server bootstrap (after DB connection is ready).
 */
export function startWorker(opts: WorkerOptions = {}): void {
  if (workerHandle) return
  const pollMs = opts.pollIntervalMs ?? 3000
  const batchSize = opts.batchSize ?? 1
  const log = opts.onLog ?? (() => {})

  const tick = async () => {
    if (workerStopping) return
    try {
      for (let i = 0; i < batchSize; i++) {
        const job = await claimNextJob()
        if (!job) break
        await runJob(job, log)
      }
    } catch (err) {
      log('error', 'worker tick failed', { err: (err as Error).message })
    } finally {
      if (!workerStopping) workerHandle = setTimeout(tick, pollMs)
    }
  }

  log('info', 'ingest worker started', { pollMs, batchSize })
  workerHandle = setTimeout(tick, pollMs)
}

/** Stop the worker after the current tick finishes. */
export async function stopWorker(): Promise<void> {
  workerStopping = true
  if (workerHandle) {
    clearTimeout(workerHandle)
    workerHandle = undefined
  }
}

/**
 * Atomically claim the next runnable job. Uses `FOR UPDATE SKIP LOCKED` so
 * multiple worker instances never grab the same job. Also picks up jobs
 * whose `lockedUntil` has expired (a previous worker crashed mid-run).
 */
async function claimNextJob(): Promise<JobRow | null> {
  const s = rawSql()
  const rows = await s<JobRow[]>`
    WITH picked AS (
      SELECT id
        FROM rag_ingest_jobs
       WHERE (status = 'pending'
              OR (status = 'running' AND "lockedUntil" IS NOT NULL AND "lockedUntil" < NOW()))
         AND attempts < "maxAttempts"
       ORDER BY "createdAt"
       LIMIT 1
       FOR UPDATE SKIP LOCKED
    )
    UPDATE rag_ingest_jobs j
       SET status = 'running',
           "lockedUntil" = NOW() + INTERVAL '10 minutes',
           attempts = j.attempts + 1,
           "updatedAt" = NOW()
      FROM picked
     WHERE j.id = picked.id
    RETURNING j.id::text AS id,
              j."tenantId"::text AS "tenantId",
              j.kind,
              j.payload,
              j.status,
              j.attempts,
              j."maxAttempts",
              j."lastError",
              j."createdAt"
  `
  return rows[0] ?? null
}

async function markDone(id: string): Promise<void> {
  const s = rawSql()
  await s`UPDATE rag_ingest_jobs SET status = 'done', "lockedUntil" = NULL, "updatedAt" = NOW() WHERE id = ${id}::bigint`
}

async function markFailedTransient(id: string, error: string, backoffMs: number): Promise<void> {
  const s = rawSql()
  await s`
    UPDATE rag_ingest_jobs
       SET status = 'pending',
           "lockedUntil" = NOW() + (${backoffMs} * INTERVAL '1 millisecond'),
           "lastError" = ${error},
           "updatedAt" = NOW()
     WHERE id = ${id}::bigint
  `
}

async function markFailedPermanent(id: string, error: string): Promise<void> {
  const s = rawSql()
  await s`UPDATE rag_ingest_jobs SET status = 'failed', "lockedUntil" = NULL, "lastError" = ${error}, "updatedAt" = NOW() WHERE id = ${id}::bigint`
}

async function runJob(
  job: JobRow,
  log: (level: 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>) => void,
): Promise<void> {
  const handler = handlers.get(job.kind)
  if (!handler) {
    await markFailedPermanent(job.id, `no handler registered for kind '${job.kind}'`)
    log('error', 'no handler', { jobId: job.id, kind: job.kind })
    return
  }
  try {
    log('info', 'job start', { jobId: job.id, kind: job.kind, attempts: job.attempts })
    await handler(job)
    await markDone(job.id)
    log('info', 'job done', { jobId: job.id })
  } catch (err) {
    const msg = (err as Error).message
    if (job.attempts >= job.maxAttempts) {
      await markFailedPermanent(job.id, msg)
      log('error', 'job permanently failed', { jobId: job.id, err: msg })
    } else {
      const backoff = Math.min(60_000, 2_000 * 2 ** (job.attempts - 1))
      await markFailedTransient(job.id, msg, backoff)
      log('warn', 'job failed, will retry', { jobId: job.id, err: msg, backoffMs: backoff, attempts: job.attempts })
    }
  }
}
