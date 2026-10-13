/**
 * Isolation diagnostic for the Gemini embed stall observed in
 * ingest-reading-library.ts.
 *
 * Walks the exact same module chain + call sequence the real ingest uses,
 * logging a timestamped breadcrumb before each potentially-blocking call.
 * If one of the steps hangs, we know exactly which component owns the
 * problem (vs. the real ingest where we only see "no output after 3 min").
 */

const T0 = Date.now()
function tick(label: string, extra?: unknown): void {
  const ms = Date.now() - T0
  const pad = ms.toString().padStart(6, ' ')
  // eslint-disable-next-line no-console
  console.log(`[T+${pad}ms] ${label}${extra !== undefined ? ' :: ' + JSON.stringify(extra) : ''}`)
}

tick('--- debug-ingest-stall start ---')

tick('import dotenv/config')
await import('dotenv/config')
tick('dotenv loaded')

tick('import rawSql (opens Postgres connection pool)')
const { rawSql } = await import('../db/client.js')
tick('rawSql imported')

tick('import gemini (SDK + embed function)')
const geminiMod = await import('../embeddings/gemini.js')
tick('gemini imported')

tick('import pipeline (chunker + full ingestDocument chain)')
await import('../ingest/pipeline.js')
tick('pipeline imported')

tick('import GoogleGenAI directly (for parallel comparison)')
const { GoogleGenAI } = await import('@google/genai')
tick('GoogleGenAI imported')

// --- Step A: hit Postgres to make sure the pool is alive ---
tick('STEP A: open Postgres sql()')
const sql = rawSql()
tick('STEP A.1: execute SELECT NOW()')
const [nowRow] = (await sql`SELECT NOW() AS now, VERSION() AS version`) as unknown as Array<{ now: Date; version: string }>
tick('STEP A done — postgres NOW()', { now: nowRow?.now?.toISOString?.(), version: nowRow?.version?.slice(0, 40) })

// --- Step B: query a row count (same read the ingest does) ---
tick('STEP B: count existing library catalog rows')
const [cnt] = (await sql`SELECT COUNT(*)::int AS n FROM rag_sources WHERE kind = 'library' AND id LIKE '%:catalog'`) as unknown as Array<{ n: number }>
tick('STEP B done', { libraryCatalogRows: cnt?.n })

// --- Step C: call Gemini DIRECTLY via a fresh SDK client (control) ---
tick('STEP C: direct GoogleGenAI embed (unique text, fresh client)')
const directAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY })
const uniqueDirect = `debug direct ${Date.now()}`
const directRes = await directAi.models.embedContent({
  model: 'gemini-embedding-001',
  contents: [{ role: 'user', parts: [{ text: uniqueDirect }] }],
  config: { taskType: 'RETRIEVAL_QUERY', outputDimensionality: 1536 },
})
tick('STEP C done — direct embed OK', { dims: directRes.embeddings?.[0]?.values?.length ?? 0 })

// --- Step D: call Gemini via our wrapped embed() (goes through cache + throttle + withRetry) ---
tick('STEP D: wrapped embed() — unique text so cache always misses')
const uniqueWrapped = `debug wrapped ${Date.now()}`
const wrappedRes = await geminiMod.embed([uniqueWrapped], { taskType: 'RETRIEVAL_QUERY' })
tick('STEP D done — wrapped embed OK', { dims: wrappedRes[0]?.length ?? 0 })

// --- Step E: second wrapped embed to catch any socket-pool reuse issue ---
tick('STEP E: SECOND wrapped embed() — tests socket reuse across calls')
const uniqueWrapped2 = `debug wrapped two ${Date.now()}`
const wrapped2Res = await geminiMod.embed([uniqueWrapped2], { taskType: 'RETRIEVAL_QUERY' })
tick('STEP E done — second wrapped embed OK', { dims: wrapped2Res[0]?.length ?? 0 })

// --- Step F: a batch of 5 (same shape ingest uses for a chunked book page) ---
tick('STEP F: wrapped embed() with batch of 5 unique chunks')
const batch = Array.from({ length: 5 }, (_, i) => `debug batch item ${i} ${Date.now()}`)
const batchRes = await geminiMod.embed(batch, { taskType: 'RETRIEVAL_DOCUMENT' })
tick('STEP F done — batch embed OK', { count: batchRes.length, firstDims: batchRes[0]?.length ?? 0 })

tick('--- all steps succeeded ---')

// Close the Postgres pool so Node can exit cleanly.
tick('closing Postgres pool')
await sql.end()
tick('postgres closed; exit 0')
process.exit(0)
