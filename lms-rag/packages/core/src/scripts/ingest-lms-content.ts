/**
 * Ingest content from the shared lms-service Postgres into the RAG index.
 *
 * Reads (never writes) these lms-service tables:
 *   - courses    (id, title, description, tenantId)
 *   - modules    (id, title, description, courseId)
 *   - contents   (id, contentId, contentType, moduleId)
 *   - videos / audios / resources / reads  (for lesson titles + descriptions)
 *
 * Writes to rag_sources + rag_chunks via the shared ingest pipeline. Each
 * course, module, and video becomes one RAG source. Idempotent — safe to re-run.
 *
 * Chunk shape (what the LLM sees in retrieval):
 *   - Course chunk — title + description + markdown listing of its modules
 *     with their descriptions AND the lessons under each module (titles +
 *     types). Enables "which course covers X" and "what's in the <course>
 *     course" queries to hit course chunks with real content, not just a
 *     title + 1-sentence blurb. Historically these chunks were ~145 chars
 *     and outranked long transcript chunks in FTS because of term density;
 *     now they're structural summaries that compete fairly.
 *   - Module chunk — same pattern scoped to a single module, with a
 *     "Part of course: <title>" line so the chunk retains parent context.
 *   - Video chunk — title + description + "Lesson in course X → module Y"
 *     header + transcript. The parent-context header makes course-named
 *     queries ("what does the <course> course say about …") match the
 *     right transcript chunk via keyword FTS.
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
  moduleTitle: string | null
  courseTitle: string | null
}

function joinBody(...parts: (string | null | undefined)[]): string {
  return parts
    .map((p) => (p ?? '').trim())
    .filter((p) => p.length > 0)
    .join('\n\n')
}

/**
 * A lesson as it sits inside a module — the data we need to compose course /
 * module summary chunks. Pulled via a single JOIN across the four polymorphic
 * content tables (videos/audios/reads/resources) since `contents.contentType`
 * is what tells us which to look at. Never ingested as its own RAG source —
 * individual videos / PDFs are already handled by their own ingest paths.
 */
interface LessonSummaryRow {
  moduleId: number
  contentId: number
  contentType: string
  title: string
  description: string | null
}

async function loadLessonsByModule(
  sql: ReturnType<typeof rawSql>,
  moduleIds: number[],
): Promise<Map<number, LessonSummaryRow[]>> {
  const by = new Map<number, LessonSummaryRow[]>()
  if (moduleIds.length === 0) return by
  const rows = (await sql<LessonSummaryRow[]>`
    SELECT
      ct."moduleId",
      ct."contentId",
      ct."contentType",
      COALESCE(v.title, a.title, r.title, rd.title) AS title,
      COALESCE(v.description, a.description, r.description, rd.description) AS description
    FROM contents ct
    LEFT JOIN videos v   ON ct."contentType" = 'VIDEO'    AND ct."contentId" = v.id
    LEFT JOIN audios a   ON ct."contentType" = 'AUDIO'    AND ct."contentId" = a.id
    LEFT JOIN resources r ON ct."contentType" = 'RESOURCE' AND ct."contentId" = r.id
    LEFT JOIN reads rd   ON ct."contentType" = 'READ'     AND ct."contentId" = rd.id
    WHERE ct."deletedAt" IS NULL AND ct."moduleId" = ANY(${moduleIds})
    ORDER BY ct."moduleId", ct."sequenceNumber" ASC NULLS LAST, ct.id
  `) as unknown as LessonSummaryRow[]
  for (const r of rows) {
    if (!by.has(r.moduleId)) by.set(r.moduleId, [])
    by.get(r.moduleId)!.push(r)
  }
  return by
}

async function loadModulesByCourse(
  sql: ReturnType<typeof rawSql>,
  courseIds: number[],
): Promise<Map<number, ModuleRow[]>> {
  const by = new Map<number, ModuleRow[]>()
  if (courseIds.length === 0) return by
  const rows = (await sql<ModuleRow[]>`
    SELECT m.id, m.title, m.description, m."courseId", c."tenantId"
    FROM modules m
    JOIN courses c ON c.id = m."courseId"
    WHERE m."deletedAt" IS NULL AND m."courseId" = ANY(${courseIds})
    ORDER BY m."courseId", m."sequenceNumber" ASC NULLS LAST, m.id
  `) as unknown as ModuleRow[]
  for (const r of rows) {
    if (!by.has(r.courseId)) by.set(r.courseId, [])
    by.get(r.courseId)!.push(r)
  }
  return by
}

function lessonTypeLabel(contentType: string): string {
  switch (contentType) {
    case 'VIDEO':    return 'video'
    case 'AUDIO':    return 'audio'
    case 'READ':     return 'reading'
    case 'RESOURCE': return 'resource'
    default:         return contentType.toLowerCase()
  }
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1).trimEnd() + '…'
}

/**
 * Compose the course-level RAG chunk text. Replaces the old
 * `joinBody(title, description)` which was ~145 chars of mostly-useless
 * metadata that competed with real transcript chunks in retrieval ranking.
 * The new summary surfaces module and lesson structure so queries like
 * "which course covers X" or "what's in the Visitor Reception course" can
 * actually match.
 */
function buildCourseSummary(
  course: CourseRow,
  modules: ModuleRow[],
  lessonsByModule: Map<number, LessonSummaryRow[]>,
): string {
  const parts: string[] = []
  parts.push(`# ${course.title}`)
  if (course.description && course.description.trim()) {
    parts.push(course.description.trim())
  }
  if (modules.length === 0) return parts.join('\n\n')

  const moduleLines = modules.map((m) => {
    const desc = (m.description ?? '').trim()
    return desc ? `- **${m.title}**: ${clip(desc, 200)}` : `- **${m.title}**`
  })
  parts.push(`## Modules in this course\n${moduleLines.join('\n')}`)

  const moduleBlocks: string[] = []
  for (const m of modules) {
    const lessons = lessonsByModule.get(m.id) ?? []
    if (lessons.length === 0) continue
    const items = lessons.map((l) => `  - ${l.title} (${lessonTypeLabel(l.contentType)})`).join('\n')
    moduleBlocks.push(`- ${m.title}\n${items}`)
  }
  if (moduleBlocks.length > 0) {
    parts.push(`## Lessons covered\n${moduleBlocks.join('\n')}`)
  }
  return parts.join('\n\n')
}

/**
 * Compose the module-level RAG chunk text. Same intent as
 * `buildCourseSummary` but scoped to a single module and its direct lessons.
 * Lesson descriptions are kept short to prevent the module chunk from
 * duplicating content that already lives in the individual video / PDF
 * chunks ingested by the per-type paths.
 */
function buildModuleSummary(
  mod: ModuleRow,
  lessons: LessonSummaryRow[],
  parentCourseTitle: string | null,
): string {
  const parts: string[] = []
  parts.push(`# ${mod.title}`)
  if (mod.description && mod.description.trim()) parts.push(mod.description.trim())
  if (parentCourseTitle) parts.push(`Part of course: ${parentCourseTitle}`)
  if (lessons.length === 0) return parts.join('\n\n')
  const items = lessons.map((l) => {
    const desc = (l.description ?? '').trim()
    const short = desc ? `: ${clip(desc, 150)}` : ''
    return `- **${l.title}** (${lessonTypeLabel(l.contentType)})${short}`
  })
  parts.push(`## Lessons in this module\n${items.join('\n')}`)
  return parts.join('\n\n')
}

export interface IngestSummary {
  courses: { ingested: number; skipped: number }
  modules: { ingested: number; skipped: number }
  videos: { ingested: number; skipped: number }
}

/**
 * Run the LMS-content ingest with the given options. Exported so cron / server
 * callers can invoke it without spawning a subprocess. Does NOT close the DB
 * connection — the caller is responsible for `rawSql().end()` when appropriate
 * (a cron loop wants the pool kept warm; a one-shot CLI wants it closed).
 */
export async function runIngest(args: CliArgs): Promise<IngestSummary> {
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
    // Pre-fetch all modules + lessons once so the per-course summary composer
    // doesn't N+1 query the DB. For ~100 courses this is a single query each
    // vs 200+ one-off queries.
    const courseIds = rows.map((c) => c.id)
    const modulesByCourse = await loadModulesByCourse(sql, courseIds)
    const allModuleIds: number[] = []
    for (const mods of modulesByCourse.values()) for (const m of mods) allModuleIds.push(m.id)
    const lessonsByModule = await loadLessonsByModule(sql, allModuleIds)
    for (const c of rows) {
      const modules = modulesByCourse.get(c.id) ?? []
      const body = buildCourseSummary(c, modules, lessonsByModule)
      if (!body || body === `# ${c.title}`) {
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
    // Pre-fetch lessons under each module AND the parent course titles so the
    // per-module summary composer can reference both without N+1 queries.
    const modIds = rows.map((m) => m.id)
    const moduleLessons = await loadLessonsByModule(sql, modIds)
    const parentCourseIds = Array.from(new Set(rows.map((m) => m.courseId)))
    const parentCourses = parentCourseIds.length
      ? ((await sql<{ id: number; title: string }[]>`
          SELECT id, title FROM courses WHERE id = ANY(${parentCourseIds})
        `) as unknown as { id: number; title: string }[])
      : []
    const courseTitleById = new Map(parentCourses.map((c) => [c.id, c.title] as const))
    for (const m of rows) {
      const lessons = moduleLessons.get(m.id) ?? []
      const body = buildModuleSummary(m, lessons, courseTitleById.get(m.courseId) ?? null)
      if (!body || body === `# ${m.title}`) {
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
                 m."courseId", c."tenantId",
                 m.title AS "moduleTitle", c.title AS "courseTitle"
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
                 m."courseId", c."tenantId",
                 m.title AS "moduleTitle", c.title AS "courseTitle"
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
      // Prepend a one-line parent-context header so queries that mention the
      // course or module name ("what does the Visitor Reception course say
      // about …") can hit this chunk via keyword FTS even if the transcript
      // doesn't name the course directly.
      const parentHeader =
        v.courseTitle && v.moduleTitle
          ? `Lesson in course "${v.courseTitle}" → module "${v.moduleTitle}"`
          : null
      const body = joinBody(v.title, v.description, parentHeader, v.transcript)
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

  return {
    courses: { ingested: coursesIngested, skipped: coursesSkipped },
    modules: { ingested: modulesIngested, skipped: modulesSkipped },
    videos: { ingested: videosIngested, skipped: videosSkipped },
  }
}

async function main() {
  const args = parseArgs()
  try {
    await runIngest(args)
  } finally {
    await rawSql().end()
  }
}

// CLI entry — only runs when invoked directly, not when imported.
const isDirectRun =
  import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` ||
  process.argv[1]?.endsWith('ingest-lms-content.ts') ||
  process.argv[1]?.endsWith('ingest-lms-content.js')

if (isDirectRun) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
