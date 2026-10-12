/**
 * Smoke-test the HTML→text extractor against real reading-library HTML.
 * Doesn't touch the DB or Gemini. Run with:
 *   pnpm --filter @ai-guru/core exec tsx src/scripts/test-html-extract.ts
 */
import { htmlToStructuredText } from '../ingest/html-text.js'

const BOOK_ID = process.env.TEST_BOOK_ID ?? 'ad8b52df-1efb-4ed6-bd2a-18ede1348f39' // Strategy & Planning
const PAGE = Number(process.env.TEST_BOOK_PAGE ?? '1')
const PAGE_SIZE = Number(process.env.TEST_BOOK_PAGE_SIZE ?? '15')

async function main() {
  const url = `https://templeinfo.org/api/books/${BOOK_ID}/html-content?page=${PAGE}&pageSize=${PAGE_SIZE}`
  console.log('Fetching', url)
  const started = Date.now()
  const resp = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!resp.ok) {
    console.error('upstream', resp.status, resp.statusText)
    process.exit(1)
  }
  const data = (await resp.json()) as { html: string; pagination: { page: number; totalPages: number; hasMore: boolean } }
  console.log('Fetched in', Date.now() - started, 'ms')
  console.log('pagination:', data.pagination)
  console.log('html length:', data.html.length, 'chars')
  console.log('')
  console.log('====== EXTRACTED TEXT ======')
  const text = htmlToStructuredText(data.html)
  console.log('text length:', text.length, 'chars')
  console.log('')
  console.log('----- first 2000 chars -----')
  console.log(text.slice(0, 2000))
  console.log('')
  console.log('----- last 500 chars -----')
  console.log(text.slice(Math.max(0, text.length - 500)))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
