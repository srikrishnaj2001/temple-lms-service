import { readFile } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'
import mammoth from 'mammoth'
import { loadGlossary } from '../glossary/loader.js'
import { loadAllFixtureVideos } from '../gumlet/fixtures.js'
import { ingestDirectory, ingestDocument } from '../ingest/pipeline.js'
import { ingestVideo } from '../ingest/video.js'

interface CliArgs {
  docs?: string
  file?: string
  videos: boolean
  glossary: string
  dryRun: boolean
  courseId: number
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)
  const out: CliArgs = {
    docs: undefined,
    videos: false,
    glossary: resolve(process.cwd(), 'fixtures/glossary/glossary.example.json'),
    dryRun: false,
    // Must be overridden with --course <id>. There is no more 'global' sentinel;
    // courseId is a required integer from lms-service courses.id.
    courseId: NaN,
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '--docs') out.docs = args[++i]
    else if (a === '--file') out.file = args[++i]
    else if (a === '--videos') out.videos = true
    else if (a === '--glossary') out.glossary = resolve(args[++i]!)
    else if (a === '--course') out.courseId = Number(args[++i])
    else if (a === '--dry-run') out.dryRun = true
    else if (a === '--help' || a === '-h') {
      printHelp()
      process.exit(0)
    }
  }
  return out
}

function printHelp() {
  console.log(`Usage: pnpm ingest [options]

  --docs <dir>       ingest all supported files under <dir> (.md, .txt, .docx)
  --file <path>      ingest ONE file only (bypasses the directory walker)
  --videos           ingest all fixture videos (glossary correction + embed)
  --course <id>      REQUIRED: integer courseId from lms-service courses.id
  --glossary <file>  path to glossary JSON (default: fixtures/glossary/glossary.example.json)
  --dry-run          embed but do not upsert
`)
}

async function ingestOneFile(
  filePath: string,
  opts: { dryRun: boolean; courseId: number },
) {
  const abs = resolve(filePath)
  const ext = extname(abs).toLowerCase()
  const name = basename(abs)
  let text: string
  let title: string
  if (ext === '.docx') {
    const buf = await readFile(abs)
    const { value } = await mammoth.extractRawText({ buffer: buf })
    text = value.replace(/\r\n/g, '\n').replace(/\n{2,}/g, '\n\n').trim()
    title = name
  } else if (ext === '.md' || ext === '.markdown' || ext === '.txt') {
    text = await readFile(abs, 'utf-8')
    title = name
  } else {
    throw new Error(`Unsupported file type: ${ext}`)
  }
  const id = name.replace(/\W+/g, '_').replace(/^_|_$/g, '')
  console.log(`[ingest] single file: ${name} (${text.length} chars)`)
  const res = await ingestDocument({ id, title, text }, opts)
  console.log(`  ingested=${res.ingested} chunks=${res.chunkCount}`)
}

async function main() {
  const args = parseArgs()
  if (!args.docs && !args.videos && !args.file) {
    printHelp()
    process.exit(1)
  }
  if (!Number.isFinite(args.courseId) || args.courseId <= 0) {
    console.error('--course <integer> is required (courses.id from lms-service; there is no more "global" default)')
    process.exit(2)
  }

  console.log(`[ingest] courseId = ${args.courseId}`)

  if (args.file) {
    await ingestOneFile(args.file, {
      dryRun: args.dryRun,
      courseId: args.courseId,
    })
  }

  if (args.docs) {
    console.log(`[ingest] documents from ${args.docs}`)
    const res = await ingestDirectory(args.docs, {
      dryRun: args.dryRun,
      courseId: args.courseId,
    })
    console.log(JSON.stringify(res, null, 2))
  }

  if (args.videos) {
    console.log('[ingest] fixture videos')
    const glossary = await loadGlossary(args.glossary)
    const videos = await loadAllFixtureVideos()
    for (const video of videos) {
      // Per-video courseId in fixture wins; --course is the fallback.
      const videoCourse = video.courseId ?? args.courseId
      const label = video.playbackUrl ? ` [${video.playbackUrl.slice(0, 60)}...]` : ''
      console.log(`  - ${video.videoId} course=${videoCourse} (${video.cues.length} cues)${label}`)
      const res = await ingestVideo(video, glossary, {
        courseId: videoCourse,
        playbackUrl: video.playbackUrl,
        // Skip glossary correction by default now — VTT fixtures are hand-crafted.
        // Set INGEST_CORRECT_VIDEOS=true to re-enable when you have real Gumlet ASR output.
        skipCorrection: process.env.INGEST_CORRECT_VIDEOS !== 'true',
      })
      console.log(`    ingested ${res.cuesIngested} cues`)
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
