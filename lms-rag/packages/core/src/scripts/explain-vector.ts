import { rawSql } from '../db/client.js'
import { embedOne } from '../embeddings/gemini.js'

/**
 * Verifies the pgvector index is actually used at query time.
 * Runs EXPLAIN (ANALYZE, BUFFERS) on the real retrieval SQL with a real
 * embedding — same shape retrieval/vector.ts uses.
 *
 * Args:
 *   --courses <csv>  optional comma-separated integer course ids to filter by
 */

async function main() {
  const sql = rawSql()

  const arg = process.argv.find((a) => a.startsWith('--courses='))
  const courseIds = arg
    ? arg
        .replace('--courses=', '')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n))
    : []

  // 1. Column dimension + index metadata
  console.log('=== 1. Column type + index definitions ===')
  const cols = await sql<{ table_name: string; column_name: string; udt_name: string }[]>`
    SELECT c.table_name, c.column_name, c.udt_name
      FROM information_schema.columns c
     WHERE c.column_name = 'embedding'
       AND c.table_name IN ('rag_chunks', 'rag_video_cues')
  `
  console.log('embedding columns:', cols)

  const idx = await sql<{ indexname: string; indexdef: string }[]>`
    SELECT indexname, indexdef
      FROM pg_indexes
     WHERE tablename IN ('rag_chunks', 'rag_video_cues')
       AND indexdef ILIKE '%hnsw%'
  `
  console.log('\nHNSW index defs:')
  for (const i of idx) console.log('  ', i.indexname, '\n    ', i.indexdef)

  // 2. Extract actual dimension from schema
  const dimCheck = await sql<{ atttypmod: number }[]>`
    SELECT a.atttypmod
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
     WHERE c.relname = 'rag_chunks' AND a.attname = 'embedding'
  `
  console.log('\nrag_chunks.embedding atttypmod (= dimension):', dimCheck[0]?.atttypmod)

  // 3. Prepare a real query embedding
  console.log('\n=== 2. Building a real query embedding via Gemini ===')
  const qvec = await embedOne('What are the three sub-departments of Treasury?', 'RETRIEVAL_QUERY')
  console.log('query vector dims:', qvec.length)
  const literal = `[${qvec.join(',')}]`

  // 4. EXPLAIN unfiltered (baseline)
  console.log('\n=== 3. EXPLAIN unfiltered vector search (no course filter) ===')
  const explain1 = await sql<{ 'QUERY PLAN': string }[]>`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
    SELECT id, embedding <=> ${literal}::vector AS distance
      FROM rag_chunks
     WHERE embedding IS NOT NULL
     ORDER BY embedding <=> ${literal}::vector
     LIMIT 10
  `
  for (const row of explain1) console.log(row['QUERY PLAN'])

  // 5. EXPLAIN filtered (real production query with courseId ANY)
  if (courseIds.length > 0) {
    console.log(`\n=== 4. EXPLAIN filtered by courseId=${JSON.stringify(courseIds)} (real production query) ===`)
    const explain2 = await sql<{ 'QUERY PLAN': string }[]>`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT c.id, s.title AS source_title,
             c.embedding <=> ${literal}::vector AS distance
        FROM rag_chunks c
        JOIN rag_sources s ON s.id = c."sourceId"
       WHERE c.embedding IS NOT NULL
         AND c."courseId" = ANY(${courseIds}::int[])
       ORDER BY c.embedding <=> ${literal}::vector
       LIMIT 10
    `
    for (const row of explain2) console.log(row['QUERY PLAN'])
  } else {
    console.log('\n=== 4. Skipped filtered EXPLAIN (pass --courses=1,2,3 to run) ===')
  }

  // 6. Row counts (to know if we're too small to matter)
  const counts = await sql<{ chunks: number; video_cues: number }[]>`
    SELECT
      (SELECT COUNT(*)::int FROM rag_chunks)     AS chunks,
      (SELECT COUNT(*)::int FROM rag_video_cues) AS video_cues
  `
  console.log('\n=== 5. Table sizes ===')
  console.log(counts[0])

  await sql.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
