import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'
import mammoth from 'mammoth'
import { sql } from 'drizzle-orm'
import { chunkDocument, type SourceDoc } from '../chunking/chunker.js'
import { db } from '../db/client.js'
import { ragChunks as chunksTable, ragSources as sourcesTable } from '../db/schema.js'
import { DEV_TENANT_ID } from '../db/index.js'
import { embed } from '../embeddings/gemini.js'

export interface IngestOptions {
  /** if true, embed but do not upsert to DB — useful for dry runs */
  dryRun?: boolean
  /** course scope for this ingest. Required in production (integer id from lms-service). */
  courseId?: number
  /** module scope for this ingest. Nullable (source may be course-level). */
  moduleId?: number
  /** content scope for this ingest. Nullable. */
  contentId?: number
  /** video id if this source is a video transcript. Nullable. */
  videoId?: number
  /** Tenant this content belongs to (UUID). Defaults to DEV_TENANT_ID for dev/POC. */
  tenantId?: string
}

export interface IngestResult {
  sourcesIngested: number
  chunksIngested: number
  chunksSkipped: number
  errors: Array<{ path: string; error: string }>
}

/**
 * Walk a directory of markdown / .txt sources and ingest each file as one
 * SourceDoc. Skips files whose contentHash matches the existing sources row —
 * this makes the pipeline idempotent so a re-run costs nothing.
 */
export async function ingestDirectory(
  dir: string,
  opts: IngestOptions = {},
): Promise<IngestResult> {
  const abs = resolve(dir)
  const files = await walk(abs)
  const result: IngestResult = { sourcesIngested: 0, chunksIngested: 0, chunksSkipped: 0, errors: [] }

  for (const file of files) {
    try {
      const base = file.split(/[\\/]/).pop() ?? file
      // MS Office lock files start with "~$" and contain a snapshot the format
      // parsers cannot read. Skip them silently.
      if (base.startsWith('~$')) continue
      const ext = extname(file).toLowerCase()
      if (!SUPPORTED_EXTS.has(ext)) continue
      const relPath = relative(abs, file).replace(/\\/g, '/')
      const { text, title } = await loadDocument(file, ext, relPath)
      const doc: SourceDoc = {
        id: relPath.replace(/\W+/g, '_').replace(/^_|_$/g, ''),
        title,
        text,
      }
      const changed = await ingestDocument(doc, opts)
      if (changed.ingested) {
        result.sourcesIngested++
        result.chunksIngested += changed.chunkCount
      } else {
        result.chunksSkipped += changed.chunkCount
      }
    } catch (err) {
      result.errors.push({ path: file, error: (err as Error).message })
    }
  }
  return result
}

export async function ingestDocument(
  doc: SourceDoc,
  opts: IngestOptions = {},
): Promise<{ ingested: boolean; chunkCount: number }> {
  const hash = createHash('sha256').update(doc.text).digest('hex')
  if (opts.courseId == null) {
    throw new Error('ingestDocument: courseId is required (integer, from lms-service courses.id)')
  }
  const courseId = opts.courseId
  const moduleId = opts.moduleId ?? null
  const contentId = opts.contentId ?? null
  const videoId = opts.videoId ?? null
  const tenantId = opts.tenantId ?? DEV_TENANT_ID

  if (!opts.dryRun) {
    const existing = await db()
      .select({
        contentHash: sourcesTable.contentHash,
        courseId: sourcesTable.courseId,
        moduleId: sourcesTable.moduleId,
      })
      .from(sourcesTable)
      .where(sql`${sourcesTable.id} = ${doc.id}`)
      .limit(1)
    if (
      existing[0]?.contentHash === hash &&
      existing[0]?.courseId === courseId &&
      (existing[0]?.moduleId ?? null) === moduleId
    ) {
      return { ingested: false, chunkCount: 0 }
    }
  }

  const docChunks = chunkDocument(doc)
  const embeddings = await embed(
    docChunks.map((c) => c.text),
    { taskType: 'RETRIEVAL_DOCUMENT' },
  )

  if (opts.dryRun) return { ingested: true, chunkCount: docChunks.length }

  // Upsert source; replace chunks (cascade delete then insert keeps ids clean).
  await db().transaction(async (tx) => {
    await tx
      .insert(sourcesTable)
      .values({
        id: doc.id,
        tenantId,
        courseId,
        moduleId,
        contentId,
        videoId,
        title: doc.title,
        kind: 'document',
        contentHash: hash,
      })
      .onConflictDoUpdate({
        target: sourcesTable.id,
        set: {
          title: doc.title,
          contentHash: hash,
          tenantId,
          courseId,
          moduleId,
          contentId,
          videoId,
        },
      })
    await tx.delete(chunksTable).where(sql`${chunksTable.sourceId} = ${doc.id}`)
    for (let i = 0; i < docChunks.length; i++) {
      const c = docChunks[i]!
      const vec = embeddings[i]!
      await tx.insert(chunksTable).values({
        id: c.chunkId,
        tenantId,
        sourceId: c.sourceId,
        courseId,
        moduleId,
        ordinal: c.ordinal,
        headingTrail: c.headingTrail,
        text: c.text,
        tokens: c.tokens,
        embedding: vec,
      })
    }
  })

  // Keyword lane (Postgres FTS) needs no app-side maintenance: the
  // `text_search` tsvector column is GENERATED ALWAYS from `text`.

  return { ingested: true, chunkCount: docChunks.length }
}

const SUPPORTED_EXTS = new Set(['.md', '.markdown', '.txt', '.docx'])

interface LoadedDoc {
  text: string
  title: string
}

/**
 * Load a source file to text. Markdown/txt read as-is; .docx routes through
 * mammoth which extracts text and preserves paragraph breaks — good enough
 * for the structural chunker.
 */
async function loadDocument(
  filePath: string,
  ext: string,
  relPath: string,
): Promise<LoadedDoc> {
  if (ext === '.docx') {
    const buf = await readFile(filePath)
    const { value } = await mammoth.extractRawText({ buffer: buf })
    // mammoth returns plain text with paragraph-aware \n breaks.
    // Convert double-newlines to blank-line separators the chunker expects.
    const normalised = value.replace(/\r\n/g, '\n').replace(/\n{2,}/g, '\n\n').trim()
    return {
      text: normalised,
      // Take the first non-empty line as title if it looks like one (short, no punctuation-heavy).
      title: firstLineOrFallback(normalised, relPath),
    }
  }
  const raw = await readFile(filePath, 'utf-8')
  return {
    text: stripFrontmatter(raw),
    title: extractTitle(raw) ?? relPath,
  }
}

function firstLineOrFallback(text: string, fallback: string): string {
  const first = text.split('\n', 1)[0]?.trim() ?? ''
  if (first.length > 0 && first.length <= 120) return first
  return fallback
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(p)))
    else if (e.isFile()) out.push(p)
  }
  return out
}

function stripFrontmatter(md: string): string {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(md)
  return m ? md.slice(m[0].length) : md
}

function extractTitle(md: string): string | undefined {
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(md)
  if (fm) {
    const t = /^title:\s*(.+)$/m.exec(fm[1]!)
    if (t) return t[1]!.trim().replace(/^["']|["']$/g, '')
  }
  const h = /^#\s+(.+)$/m.exec(md)
  return h?.[1]?.trim()
}

// exists just so callers can hash-and-compare without wiring the hash lib
export function hashText(t: string): string {
  return createHash('sha256').update(t).digest('hex')
}

export interface TextIngestInput {
  /** stable id — use `${moduleId}:${contentId}:body` for one text body per content */
  sourceId: string
  courseId: number
  moduleId?: number
  contentId?: number
  title: string
  text: string
}

/**
 * Ingest a text body directly (no filesystem). Used by the admin API when
 * the LMS pushes module/content text. Any prior version of the same sourceId is
 * replaced (idempotent).
 */
export async function ingestText(input: TextIngestInput, opts: IngestOptions = {}): Promise<{
  ingested: boolean
  chunkCount: number
}> {
  return ingestDocument(
    { id: input.sourceId, title: input.title, text: input.text },
    {
      ...opts,
      courseId: input.courseId,
      moduleId: input.moduleId,
      contentId: input.contentId,
    },
  )
}

// keep the compiler happy about unused stat import in some node versions
void stat
