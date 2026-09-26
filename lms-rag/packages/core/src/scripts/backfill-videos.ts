import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { enqueue } from '../queue/ingest-jobs.js'
import { rawSql } from '../db/client.js'

/**
 * Backfill script — enqueues an ingest job for every video listed in a
 * JSON manifest file. Use this to re-index all existing videos after:
 *   - switching chunk-window strategy
 *   - swapping embedding model
 *   - onboarding a new tenant with existing Gumlet content
 *
 * Usage:
 *   pnpm --filter @ai-guru/core backfill-videos ./videos.json
 *
 * Manifest JSON shape (array of entries):
 *   [
 *     {
 *       "tenantId":      "550e8400-e29b-41d4-a716-446655440000",
 *       "videoId":       42,                    // integer — lms-service videos.id
 *       "gumletAssetId": "6789abcdef01234567890",
 *       "courseId":      7,                     // integer — lms-service courses.id
 *       "moduleId":      3,                     // optional integer
 *       "contentId":     11,                    // optional integer
 *       "title":         "How to Perform Arati",
 *       "languagePref":  "en",                  // optional
 *       "playbackUrl":   "https://cdn.gumlet.io/..."  // optional
 *     },
 *     ...
 *   ]
 *
 * All jobs are enqueued immediately; the running API's worker picks them up
 * (~3s poll interval by default). Watch progress via `/admin/jobs` on the API,
 * or query the `rag_ingest_jobs` table directly.
 */

const EntrySchema = z.object({
  tenantId: z.string().uuid(),
  videoId: z.number().int().positive(),
  gumletAssetId: z.string().min(1),
  courseId: z.number().int().positive(),
  moduleId: z.number().int().positive().optional(),
  contentId: z.number().int().positive().optional(),
  title: z.string().min(1),
  languagePref: z.string().optional(),
  playbackUrl: z.string().url().optional(),
  maxAttempts: z.number().int().min(1).max(10).optional(),
})

const ManifestSchema = z.array(EntrySchema)

async function main() {
  const manifestPath = process.argv[2]
  if (!manifestPath) {
    console.error('Usage: pnpm --filter @ai-guru/core backfill-videos <manifest.json>')
    process.exit(2)
  }

  const raw = await readFile(manifestPath, 'utf-8')
  const entries = ManifestSchema.parse(JSON.parse(raw))
  console.log(`[backfill] ${entries.length} video(s) in ${manifestPath}`)

  let ok = 0
  let failed = 0
  for (const e of entries) {
    try {
      const jobId = await enqueue({
        kind: 'gumlet-transcript',
        tenantId: e.tenantId,
        maxAttempts: e.maxAttempts ?? 3,
        payload: {
          videoId: e.videoId,
          courseId: e.courseId,
          moduleId: e.moduleId,
          contentId: e.contentId,
          title: e.title,
          gumletAssetId: e.gumletAssetId,
          languagePref: e.languagePref,
          playbackUrl: e.playbackUrl,
        },
      })
      console.log(`  ok enqueued videoId=${e.videoId} -> jobId ${jobId}`)
      ok++
    } catch (err) {
      console.error(`  err videoId=${e.videoId}: ${(err as Error).message}`)
      failed++
    }
  }

  console.log(`[backfill] enqueued=${ok} failed=${failed}`)
  console.log('  -> watch progress: GET /admin/jobs on the running API, or SELECT * FROM rag_ingest_jobs')

  // Close the pool cleanly so the process exits.
  await rawSql().end()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
