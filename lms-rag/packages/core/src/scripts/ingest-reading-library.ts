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
 *   tenantId    = LIBRARY_TENANT_ID  (all-zero UUID, retrieval-scoped specially)
 *   courseId    = 0                   (sentinel; not a valid auto-increment id)
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
import { rawSql } from '../db/client.js'
import { htmlToStructuredText } from '../ingest/html-text.js'
import { ingestText } from '../ingest/pipeline.js'

const LIBRARY_ORIGIN = process.env.READING_LIBRARY_ORIGIN ?? 'https://templeinfo.org'

/** Reserved sentinel scope for cross-tenant / all-course library content. */
export const LIBRARY_TENANT_ID = '00000000-0000-0000-0000-000000000000'
export const LIBRARY_COURSE_ID = 0

const DEFAULT_PAGE_SIZE = 15
const FETCH_TIMEOUT_MS = 30_000

interface CatalogueBook {
  bookId: string
  bookTitle: string
  authorName?: string
  category?: string
  subcategory?: string
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
  booksProcessed: number
  booksSkipped: number
  pagesIngested: number
  pagesSkipped: number
  chunksIngested: number
  errors: Array<{ bookId: string; title?: string; page?: number; error: string }>
}

export interface LibraryIngestOptions {
  dryRun?: boolean
  /** Only ingest these bookIds (useful for CI / targeted re-ingest). */
  bookFilter?: string[] | null
}

interface CliArgs {
  dryRun: boolean
  bookFilter: string[] | null
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)
  const out: CliArgs = { dryRun: false, bookFilter: null }
  const books: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--dry-run') out.dryRun = true
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
 * Run the library ingest once. Each book's pages are iterated via the
 * upstream's own pagination (pageSize=15) — on first run we hit every page,
 * on subsequent runs the content-hash dedup inside ingestText no-ops the
 * ones that haven't changed.
 */
export async function runLibraryIngest(
  opts: LibraryIngestOptions = {},
): Promise<LibraryIngestSummary> {
  const summary: LibraryIngestSummary = {
    totalBooks: 0,
    booksProcessed: 0,
    booksSkipped: 0,
    pagesIngested: 0,
    pagesSkipped: 0,
    chunksIngested: 0,
    errors: [],
  }

  const catalogue = await fetchJson<CatalogueBook[]>(`${LIBRARY_ORIGIN}/api/books`)
  if (!Array.isArray(catalogue)) {
    throw new Error('Reading library catalogue response was not an array')
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

  for (const book of eligible) {
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

  return summary
}

async function ingestBook(
  book: CatalogueBook,
  opts: LibraryIngestOptions,
  summary: LibraryIngestSummary,
): Promise<number> {
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
        { sourceId, courseId: LIBRARY_COURSE_ID, title, text },
        {
          dryRun: opts.dryRun,
          tenantId: LIBRARY_TENANT_ID,
          kind: 'library',
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
