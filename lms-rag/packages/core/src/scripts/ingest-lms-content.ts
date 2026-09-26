/**
 * Ingest content from the shared lms-service Postgres into the RAG index.
 *
 * Reads (never writes) these lms-service tables:
 *   - courses    (id, title, description, tenantId)
 *   - modules    (id, title, description, courseId)
 *   - contents   (id, contentId, contentType, moduleId)
 *   - videos     (id, title, description, transcript)
 *
 * Writes to rag_sources + rag_chunks via the shared ingest pipeline. Each
 * course, module, and video becomes one RAG source. Text = title + description
 * (+ transcript for videos when populated). Idempotent — safe to re-run.
 *
 * Usage:
 *   pnpm --filter @ai-guru/core exec tsx src/scripts/ingest-lms-content.ts
 *   pnpm --filter @ai-guru/core exec tsx src/scripts/ingest-lms-content.ts --skip-videos
 *   pnpm --filter @ai-guru/core exec tsx src/scripts/ingest-lms-content.ts --course 1 --course 5
 */
import { rawSql } from '../db/client.js'
import { ingestText } from '../ingest/pipeline.js'

interface CliArgs {
  skipVideos: boolean
  skipModules: boolean
  skipCourses: boolean
  courseFilter: number[] | null
  dryRun: boolean
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)
  const out: CliArgs = {
    skipVideos: false,
    skipModules: false,
    skipCourses: false,
    courseFilter: null,
    dryRun: false,
  }
  const courses: number[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '--skip-videos') out.skipVideos = true
    else if (a === '--skip-modules') out.skipModules = true
    else if (a === '--skip-courses') out.skipCourses = true
    else if (a === '--dry-run') out.dryRun = true
    else if (a === '--course' && args[i + 1]) {
      const n = Number(args[i + 1])
      if (Number.isFinite(n)) courses.push(n)
      i++
    }
  }
  if (courses.length) out.courseFilter = courses
  return out
}

interface CourseRow {
  id: number
  title: string
  description: string | null
  tenantId: string
}

interface ModuleRow {
  id: number
  title: string
  description: string | null
  courseId: number
  tenantId: string
}

interface VideoRow {
  id: number
  title: string
  description: string | null
  transcript: string | null
  contentId: number
  moduleId: number
  courseId: number
  tenantId: string
}

function joinBody(...parts: (string | null | undefined)[]): string {
  return parts
    .map((p) => (p ?? '').trim())
    .filter((p) => p.length > 0)
    .join('\n\n')
}

async function main() {
  const args = parseArgs()
  const sql = rawSql()

  // 1. Courses ---------------------------------------------------------------
  let coursesIngested = 0
  let coursesSkipped = 0
  if (!args.skipCourses) {
    console.log('\n=== Courses ===')
    const rows = args.courseFilter
      ? ((await sql<CourseRow[]>`SELECT id, title, description, "tenantId" FROM courses WHERE id = ANY(${args.courseFilter}) ORDER BY id`) as unknown as CourseRow[])
      : ((await sql<CourseRow[]>`SELECT id, title, description, "tenantId" FROM courses ORDER BY id`) as unknown as CourseRow[])
    console.log(`Found ${rows.length} courses.`)
    for (const c of rows) {
      const body = joinBody(c.title, c.description)
      if (!body) {
        coursesSkipped++
        continue
      }
      const { ingested, chunkCount } = await ingestText(
        {
          sourceId: `course:${c.id}`,
          courseId: c.id,
          title: c.title,
          text: body,
        },
        { tenantId: c.tenantId, dryRun: args.dryRun },
      )
      if (ingested) {
        coursesIngested++
        console.log(`  + course:${c.id} "${c.title.slice(0, 50)}" (${chunkCount} chunks)`)
      } else {
        coursesSkipped++
      }
    }
    console.log(`Courses: ingested=${coursesIngested} skipped=${coursesSkipped}`)
  }

  // 2. Modules ---------------------------------------------------------------
  let modulesIngested = 0
  let modulesSkipped = 0
  if (!args.skipModules) {
    console.log('\n=== Modules ===')
    const rows = args.courseFilter
      ? ((await sql<ModuleRow[]>`
          SELECT m.id, m.title, m.description, m."courseId", c."tenantId"
          FROM modules m
          JOIN courses c ON c.id = m."courseId"
          WHERE m."deletedAt" IS NULL AND m."courseId" = ANY(${args.courseFilter})
          ORDER BY m.id
        `) as unknown as ModuleRow[])
      : ((await sql<ModuleRow[]>`
          SELECT m.id, m.title, m.description, m."courseId", c."tenantId"
          FROM modules m
          JOIN courses c ON c.id = m."courseId"
          WHERE m."deletedAt" IS NULL
          ORDER BY m.id
        `) as unknown as ModuleRow[])
    console.log(`Found ${rows.length} modules.`)
    for (const m of rows) {
      const body = joinBody(m.title, m.description)
      if (!body) {
        modulesSkipped++
        continue
      }
      const { ingested } = await ingestText(
        {
          sourceId: `module:${m.id}`,
          courseId: m.courseId,
          moduleId: m.id,
          title: m.title,
          text: body,
        },
        { tenantId: m.tenantId, dryRun: args.dryRun },
      )
      if (ingested) {
        modulesIngested++
        if (modulesIngested % 25 === 0)
          console.log(`  ...${modulesIngested} modules ingested`)
      } else {
        modulesSkipped++
      }
    }
    console.log(`Modules: ingested=${modulesIngested} skipped=${modulesSkipped}`)
  }

  // 3. Videos ----------------------------------------------------------------
  let videosIngested = 0
  let videosSkipped = 0
  if (!args.skipVideos) {
    console.log('\n=== Videos ===')
    const rows = args.courseFilter
      ? ((await sql<VideoRow[]>`
          SELECT v.id, v.title, v.description, v.transcript,
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
          SELECT v.id, v.title, v.description, v.transcript,
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
    console.log(`Found ${rows.length} videos.`)
    for (const v of rows) {
      const body = joinBody(v.title, v.description, v.transcript)
      if (!body) {
        videosSkipped++
        continue
      }
      const { ingested, chunkCount } = await ingestText(
        {
          sourceId: `video:${v.id}:content:${v.contentId}`,
          courseId: v.courseId,
          moduleId: v.moduleId,
          contentId: v.contentId,
          title: v.title,
          text: body,
        },
        { tenantId: v.tenantId, videoId: v.id, dryRun: args.dryRun },
      )
      if (ingested) {
        videosIngested++
        if (videosIngested % 25 === 0)
          console.log(`  ...${videosIngested} videos ingested (${chunkCount} chunks last)`)
      } else {
        videosSkipped++
      }
    }
    console.log(`Videos: ingested=${videosIngested} skipped=${videosSkipped}`)
  }

  console.log('\n=== Summary ===')
  console.log(`Courses:  ingested=${coursesIngested}  skipped=${coursesSkipped}`)
  console.log(`Modules:  ingested=${modulesIngested}  skipped=${modulesSkipped}`)
  console.log(`Videos:   ingested=${videosIngested}   skipped=${videosSkipped}`)

  await sql.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
