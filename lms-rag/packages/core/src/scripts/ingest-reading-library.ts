/**
 * Ingest the Temple Info public reading library (74 books across Governance,
 * Core Processes, Supporting Activities) into the RAG index so chat, voice,
 * and search can ground answers in book content.
 *
 * Upstream (public, no auth):
 *   GET https://templeinfo.org/api/books                       — catalogue
 *   GET https://templeinfo.org/api/books/:id/html-content      — paginated HTML
 *                                                                (default pageSize=15)
 *
 * Writes to rag_sources + rag_chunks with:
 *   sourceId    = `book:<bookId>:page:<apiPage>`
 *   kind        = 'library'
 *   tenantId    = NULL (public library)
 *   courseId    = NULL (cross-course)
 *   title       = `<bookTitle> — Page <N>/<total>`
 *   metadata    = { bookId, bookTitle, authorName, category, subcategory,
 *                   apiPage, totalPages, readerUrl }
 *
 * Idempotent: ingestText hashes the extracted text; pages that haven't
 * changed cost zero embed credits on re-run.
 *
 * Usage:
 *   pnpm --filter @ai-guru/core exec tsx src/scripts/ingest-reading-library.ts
 *   pnpm --filter @ai-guru/core exec tsx src/scripts/ingest-reading-library.ts --dry-run
 *   pnpm --filter @ai-guru/core exec tsx src/scripts/ingest-reading-library.ts --book ad8b52df-1efb-4ed6-bd2a-18ede1348f39
 */
import { createHash } from 'node:crypto'
import { rawSql } from '../db/client.js'
import { htmlToStructuredText } from '../ingest/html-text.js'
import { ingestText } from '../ingest/pipeline.js'

const LIBRARY_ORIGIN = process.env.READING_LIBRARY_ORIGIN ?? 'https://templeinfo.org'

// Library content has no owning tenant/course. rag_sources + rag_chunks
// store NULL for both when kind='library' (see migration 0004). Retrieval
// still returns these chunks via its `OR kind='library'` branch, so no
// scope sentinel is needed.

const DEFAULT_PAGE_SIZE = 15
const FETCH_TIMEOUT_MS = 30_000

interface CatalogueBook {
  bookId: string
  bookTitle: string
  authorName?: string
  category?: string
  subcategory?: string
  description?: string
  isVisible?: boolean
  hasContent?: boolean
  sequenceNumber?: number
}

interface PageResponse {
  html: string
  pagination: {
    page: number
    totalPages: number
    hasMore: boolean
  }
}

export interface LibraryIngestSummary {
  totalBooks: number
  /** Books whose metadata is already in sync with the DB — not re-fetched. */
  booksUnchanged: number
  /** Books whose metadata differed from the DB — new or edited upstream. */
  booksChanged: number
  booksProcessed: number
  booksSkipped: number
  catalogIngested: number
  pagesIngested: number
  pagesSkipped: number
  chunksIngested: number
  /** Set when the catalogue JSON hash matched the last-seen in-memory hash
   *  so we exited before touching the DB or fetching any book pages. */
  catalogueUnchanged: boolean
  errors: Array<{ bookId: string; title?: string; page?: number; error: string }>
}

export interface LibraryIngestOptions {
  dryRun?: boolean
  /** Only ingest these bookIds (useful for CI / targeted re-ingest). */
  bookFilter?: string[] | null
  /** Bypass the catalogue-hash + metadata-diff short-circuits and run a full
   *  ingest for every eligible book. Used by the manual CLI and by the slower
   *  "safety-net" cron that catches content-only changes the fast-tick cron
   *  cannot detect from catalogue metadata alone. */
  force?: boolean
}

/** In-memory cache of the last catalogue response hash. Lost on process
 *  restart (acceptable — next tick does a full DB diff and repopulates). */
let lastCatalogueHash: string | undefined
let lastFullIngestAt = 0
const FULL_REFRESH_MS = 6 * 60 * 60 * 1000

interface CliArgs {
  dryRun: boolean
  bookFilter: string[] | null
  force: boolean
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)
  const out: CliArgs = { dryRun: false, bookFilter: null, force: false }
  const books: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--dry-run') out.dryRun = true
    else if (a === '--force') out.force = true
    else if (a === '--book' && args[i + 1]) {
      books.push(args[i + 1]!)
      i++
    }
  }
  if (books.length) out.bookFilter = books
  return out
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} from ${url}`)
  }
  return (await response.json()) as T
}

/**
 * Index readable, visible books. Unchanged catalogues are skipped for up to
 * six hours; the periodic full refresh catches content-only edits. Failed
 * runs retry next tick, with unchanged page embeddings reused.
 */
export async function runLibraryIngest(
  opts: LibraryIngestOptions = {},
): Promise<LibraryIngestSummary> {
  const summary: LibraryIngestSummary = {
    totalBooks: 0,
    booksUnchanged: 0,
    booksChanged: 0,
    booksProcessed: 0,
    booksSkipped: 0,
    catalogIngested: 0,
    pagesIngested: 0,
    pagesSkipped: 0,
    chunksIngested: 0,
    catalogueUnchanged: false,
    errors: [],
  }

  const catalogue = await fetchJson<CatalogueBook[]>(`${LIBRARY_ORIGIN}/api/books`)
  if (!Array.isArray(catalogue)) {
    throw new Error('Reading library catalogue response was not an array')
  }

  // Short-circuit 1: upstream catalogue identical to last tick's response.
  const catalogueHash = createHash('sha256')
    .update(JSON.stringify(catalogue))
    .digest('hex')
  const skipCatalogueCheck = opts.force === true || opts.bookFilter != null
  if (!skipCatalogueCheck && lastCatalogueHash === catalogueHash && Date.now() - lastFullIngestAt < FULL_REFRESH_MS) {
    summary.catalogueUnchanged = true
    return summary
  }

  const filterSet = opts.bookFilter ? new Set(opts.bookFilter) : null
  const eligible = catalogue.filter((book) => {
    if (!book || typeof book.bookId !== 'string' || typeof book.bookTitle !== 'string') return false
    if (book.isVisible === false) return false
    if (book.hasContent !== true) return false
    if (filterSet && !filterSet.has(book.bookId)) return false
    return true
  })

  summary.totalBooks = eligible.length

  // Catalogue metadata cannot prove page bodies are unchanged, nor that a
  // previous run finished every page. ingestText deduplicates embeddings.
  for (const book of eligible) {
    summary.booksChanged++
    try {
      const pagesIngested = await ingestBook(book, opts, summary)
      if (pagesIngested > 0) summary.booksProcessed++
      else summary.booksSkipped++
    } catch (err) {
      summary.booksSkipped++
      summary.errors.push({
        bookId: book.bookId,
        title: book.bookTitle,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      })
    }
  }

  // Only remember the catalogue hash when:
  //   - we did a full/unfiltered run (--book filter is a one-off, mustn't poison), AND
  //   - no books errored out (if any did, the next tick must do the full diff
  //     so the failed books get retried — otherwise the hash short-circuit
  //     would skip them forever).
  if (!opts.dryRun && !opts.bookFilter && summary.errors.length === 0) {
    // Remove indexed books hidden, removed, or made unavailable upstream.
    // This only touches our derived index; the upstream library is untouched.
    const sql = rawSql()
    const bookIds = eligible.map(book => book.bookId)
    await sql`DELETE FROM rag_sources WHERE kind = 'library'
      AND NOT (COALESCE(metadata->>'bookId', '') = ANY(${bookIds}::text[]))`
    lastFullIngestAt = Date.now()
    lastCatalogueHash = catalogueHash
  }

  return summary
}

/**
 * Build the catalogue chunk text — one chunk per book summarising title,
 * author, category and a hint of topics. This is what gets matched when a
 * learner searches by category ("governance", "kitchen") or asks the
 * chatbot "suggest me books on governance". Deliberately short and
 * keyword-dense so FTS catches category/subcategory terms even when no
 * page body happens to use them literally.
 */
function buildCatalogText(book: CatalogueBook): string {
  const lines: string[] = []
  lines.push(`Book: ${book.bookTitle}`)
  if (book.authorName) lines.push(`Author: ${book.authorName}`)
  if (book.category) lines.push(`Category: ${book.category}`)
  if (book.subcategory) lines.push(`Subcategory: ${book.subcategory}`)
  lines.push('')
  if (book.description && book.description.trim()) {
    lines.push(book.description.trim())
    lines.push('')
  }
  // Flattened topic hint — makes keyword queries like "books on governance"
  // or "books about kitchen" match even when the body doesn't use the word.
  const topics = [book.category, book.subcategory, book.bookTitle]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .join(', ')
  if (topics) lines.push(`Topics covered: ${topics}.`)
  lines.push(
    'This is a catalogue entry in the Reading Library. Readers can open the full book from the reader.',
  )
  return lines.join('\n')
}

async function ingestCatalogChunk(
  book: CatalogueBook,
  opts: LibraryIngestOptions,
  summary: LibraryIngestSummary,
): Promise<void> {
  const sourceId = `book:${book.bookId}:catalog`
  const title = `${book.bookTitle} — Catalogue Entry`
  const text = buildCatalogText(book)
  const readerUrl = `/reading-library/${book.bookId}`
  try {
    const result = await ingestText(
      { sourceId, courseId: null, title, text },
      {
        dryRun: opts.dryRun,
        tenantId: undefined,
        kind: 'library',
        // Cap the embed call so a Gemini socket stall can't lock the cron.
        // On timeout, caller catches EMBED_TIMEOUT, logs, continues to next
        // book. Next cron tick retries (content-hash dedup makes it free).
        embedTimeoutMs: 30_000,
        metadata: {
          bookId: book.bookId,
          bookTitle: book.bookTitle,
          authorName: book.authorName ?? '',
          category: book.category ?? '',
          subcategory: book.subcategory ?? '',
          isCatalog: true,
          readerUrl,
        },
      },
    )
    if (result.ingested) {
      summary.catalogIngested++
      summary.chunksIngested += result.chunkCount
    }
  } catch (err) {
    summary.errors.push({
      bookId: book.bookId,
      title: book.bookTitle,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    })
  }
}

async function ingestBook(
  book: CatalogueBook,
  opts: LibraryIngestOptions,
  summary: LibraryIngestSummary,
): Promise<number> {
  // Catalogue chunk first — cheap and makes category/catalog queries work
  // even when per-page content doesn't contain the matching keyword.
  await ingestCatalogChunk(book, opts, summary)

  let page = 1
  let totalPages = Infinity
  let pagesIngestedForBook = 0

  while (page <= totalPages) {
    const url = `${LIBRARY_ORIGIN}/api/books/${book.bookId}/html-content?page=${page}&pageSize=${DEFAULT_PAGE_SIZE}`
    const data = await fetchJson<PageResponse>(url)
    if (!data) {
      // 404 on page 1 = no content ever; break silently. 404 on later pages
      // means we overshot — also break.
      break
    }
    totalPages = data.pagination?.totalPages ?? 1

    const text = htmlToStructuredText(data.html ?? '')
    if (!text) {
      summary.pagesSkipped++
      if (!data.pagination?.hasMore) break
      page++
      continue
    }

    const sourceId = `book:${book.bookId}:page:${page}`
    const title = `${book.bookTitle} — Page ${page}/${totalPages}`
    const readerUrl = `/reading-library/${book.bookId}?page=${page}`

    try {
      const result = await ingestText(
        // Library content is cross-tenant/cross-course — pipeline accepts
        // null and writes NULL into rag_sources + rag_chunks (see migration
        // 0004_library_sources.sql). Retrieval still returns these chunks
        // via its `OR kind='library'` branch.
        { sourceId, courseId: null, title, text },
        {
          dryRun: opts.dryRun,
          tenantId: undefined, // NULL tenantId for library
          kind: 'library',
          // Cap the embed call so one stalled Gemini socket doesn't lock
          // the whole cron tick. On timeout, caller catches EMBED_TIMEOUT,
          // skips this page, and continues to the next page / book. Next
          // tick retries from where we left off (content-hash dedup).
          embedTimeoutMs: 30_000,
          metadata: {
            bookId: book.bookId,
            bookTitle: book.bookTitle,
            authorName: book.authorName ?? '',
            category: book.category ?? '',
            subcategory: book.subcategory ?? '',
            apiPage: page,
            totalPages,
            readerUrl,
          },
        },
      )
      if (result.ingested) {
        summary.pagesIngested++
        summary.chunksIngested += result.chunkCount
        pagesIngestedForBook++
      } else {
        summary.pagesSkipped++
      }
    } catch (err) {
      summary.errors.push({
        bookId: book.bookId,
        title: book.bookTitle,
        page,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      })
    }

    if (!data.pagination?.hasMore || page >= totalPages) break
    page++
  }

  return pagesIngestedForBook
}

async function main(): Promise<void> {
  const args = parseArgs()
  const started = Date.now()
  try {
    const summary = await runLibraryIngest({
      dryRun: args.dryRun,
      bookFilter: args.bookFilter,
      force: args.force,
    })
    console.log(
      JSON.stringify({
        event: 'library-ingest.ok',
        durationMs: Date.now() - started,
        dryRun: args.dryRun,
        summary,
      }),
    )
    await rawSql().end()
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'library-ingest.error',
        durationMs: Date.now() - started,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      }),
    )
    await rawSql().end()
    process.exit(1)
  }
}

const isDirectRun =
  import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` ||
  process.argv[1]?.endsWith('ingest-reading-library.ts') ||
  process.argv[1]?.endsWith('ingest-reading-library.js')

if (isDirectRun) {
  main().catch((err) => {
    console.error(
      JSON.stringify({
        event: 'library-ingest.fatal',
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      }),
    )
    process.exit(1)
  })
}
