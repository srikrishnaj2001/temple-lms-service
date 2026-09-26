/**
 * Fetch VTT subtitles from Gumlet for every video in lms-service, chunk each
 * cue, embed it, and store in rag_video_cues. One-time backfill for the 199
 * seeded videos. Idempotent — reruns skip videos whose corrected transcript
 * hash hasn't changed.
 *
 * Skips (does not fail) when:
 *   - Gumlet returns no subtitle track for the asset
 *   - The subtitle URL 404s (private asset, expired token, etc.)
 *   - The parsed cue list is empty
 *
 * Usage:
 *   pnpm --filter @ai-guru/core exec tsx src/scripts/ingest-video-transcripts.ts
 *   pnpm --filter @ai-guru/core exec tsx src/scripts/ingest-video-transcripts.ts --skip-correction
 *   pnpm --filter @ai-guru/core exec tsx src/scripts/ingest-video-transcripts.ts --video 111 --video 121
 *
 * By default we SKIP the glossary correction pass — it's an extra LLM call
 * per video (currently there's no glossary loaded anyway). Pass
 * --with-correction to enable it.
 */
import { rawSql } from '../db/client.js'
import { ingestVideoFromGumlet } from '../ingest/video.js'
import type { Glossary } from '../glossary/loader.js'

interface CliArgs {
  withCorrection: boolean
  videoFilter: number[] | null
  courseFilter: number[] | null
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)
  const out: CliArgs = { withCorrection: false, videoFilter: null, courseFilter: null }
  const vids: number[] = []
  const courses: number[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '--with-correction') out.withCorrection = true
    else if (a === '--skip-correction') out.withCorrection = false
    else if (a === '--video' && args[i + 1]) {
      const n = Number(args[i + 1])
      if (Number.isFinite(n)) vids.push(n)
      i++
    } else if (a === '--course' && args[i + 1]) {
      const n = Number(args[i + 1])
      if (Number.isFinite(n)) courses.push(n)
      i++
    }
  }
  if (vids.length) out.videoFilter = vids
  if (courses.length) out.courseFilter = courses
  return out
}

interface VideoRow {
  videoId: number
  title: string
  externalVideoId: string
  contentId: number
  moduleId: number
  courseId: number
  tenantId: string
}

async function main() {
  const args = parseArgs()
  // Empty glossary is fine — correction is off by default. Wire loadGlossary
  // in when a glossary.json fixture exists locally and --with-correction is set.
  const glossary: Glossary = []
  const sql = rawSql()

  const rows = args.videoFilter
    ? ((await sql<VideoRow[]>`
        SELECT v.id AS "videoId", v.title, v."externalVideoId",
               ct.id AS "contentId", ct."moduleId",
               m."courseId", c."tenantId"
        FROM videos v
        JOIN contents ct
          ON ct."contentType" = 'VIDEO' AND ct."contentId" = v.id
        JOIN modules m ON m.id = ct."moduleId" AND m."deletedAt" IS NULL
        JOIN courses c ON c.id = m."courseId"
        WHERE ct."deletedAt" IS NULL AND v.id = ANY(${args.videoFilter})
        ORDER BY v.id
      `) as unknown as VideoRow[])
    : args.courseFilter
      ? ((await sql<VideoRow[]>`
          SELECT v.id AS "videoId", v.title, v."externalVideoId",
                 ct.id AS "contentId", ct."moduleId",
                 m."courseId", c."tenantId"
          FROM videos v
          JOIN contents ct
            ON ct."contentType" = 'VIDEO' AND ct."contentId" = v.id
          JOIN modules m ON m.id = ct."moduleId" AND m."deletedAt" IS NULL
          JOIN courses c ON c.id = m."courseId"
          WHERE ct."deletedAt" IS NULL AND m."courseId" = ANY(${args.courseFilter})
          ORDER BY v.id
        `) as unknown as VideoRow[])
      : ((await sql<VideoRow[]>`
          SELECT v.id AS "videoId", v.title, v."externalVideoId",
                 ct.id AS "contentId", ct."moduleId",
                 m."courseId", c."tenantId"
          FROM videos v
          JOIN contents ct
            ON ct."contentType" = 'VIDEO' AND ct."contentId" = v.id
          JOIN modules m ON m.id = ct."moduleId" AND m."deletedAt" IS NULL
          JOIN courses c ON c.id = m."courseId"
          WHERE ct."deletedAt" IS NULL
          ORDER BY v.id
        `) as unknown as VideoRow[])

  console.log(`Found ${rows.length} video(s) to ingest.`)
  console.log(`Glossary correction: ${args.withCorrection ? 'ON' : 'OFF'}`)
  console.log('---')

  let ok = 0
  let skippedNoSubs = 0
  let failed = 0
  const failures: Array<{ videoId: number; error: string }> = []

  for (const v of rows) {
    try {
      const playbackUrl = `https://video.gumlet.io/${v.externalVideoId.slice(0, 24)}`
      const res = await ingestVideoFromGumlet(
        {
          videoId: v.videoId,
          title: v.title,
          gumletAssetId: v.externalVideoId,
          languagePref: 'en',
          playbackUrl,
        },
        glossary,
        {
          courseId: v.courseId,
          moduleId: v.moduleId,
          contentId: v.contentId,
          tenantId: v.tenantId,
          skipCorrection: !args.withCorrection,
        },
      )
      ok++
      console.log(`  ✓ video ${v.videoId} "${v.title.slice(0, 60)}" (${res.cuesIngested} cues)`)
    } catch (err) {
      const msg = (err as Error).message
      if (/No subtitle tracks|No usable subtitle URL/.test(msg)) {
        skippedNoSubs++
        console.log(`  · video ${v.videoId} — no subtitles, skipping`)
      } else {
        failed++
        failures.push({ videoId: v.videoId, error: msg })
        console.log(`  ✗ video ${v.videoId} — ${msg.slice(0, 200)}`)
      }
    }
  }

  console.log('\n=== Summary ===')
  console.log(`Ingested:          ${ok}`)
  console.log(`Skipped (no subs): ${skippedNoSubs}`)
  console.log(`Failed:            ${failed}`)
  if (failures.length > 0) {
    console.log('\nFailures:')
    for (const f of failures.slice(0, 20)) console.log(`  video ${f.videoId}: ${f.error.slice(0, 200)}`)
    if (failures.length > 20) console.log(`  ...and ${failures.length - 20} more`)
  }

  await sql.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
