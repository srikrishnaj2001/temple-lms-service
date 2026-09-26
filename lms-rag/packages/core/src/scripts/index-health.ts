import { rawSql } from '../db/client.js'

/**
 * Reports on:
 *   1. HNSW index parameters (m, ef_construction, ef_search default)
 *   2. Index size on disk vs table size
 *   3. Postgres memory config (shared_buffers, work_mem, effective_cache_size)
 *   4. Cache hit ratio (should be > 99% at steady state)
 *   5. Estimated in-memory footprint per row
 *
 * Runs against whatever DB DATABASE_URL points at.
 */

async function main() {
  const sql = rawSql()

  console.log('=== 1. HNSW index parameters ===')
  const idxParams = await sql<
    {
      indexname: string
      indexdef: string
      access_method: string
      opts: string[] | null
    }[]
  >`
    SELECT i.indexname,
           i.indexdef,
           am.amname AS access_method,
           c.reloptions AS opts
      FROM pg_indexes i
      JOIN pg_class c ON c.relname = i.indexname
      JOIN pg_am am ON am.oid = c.relam
     WHERE i.tablename IN ('rag_chunks', 'rag_video_cues')
       AND am.amname = 'hnsw'
  `
  for (const r of idxParams) {
    console.log(`  ${r.indexname}`)
    console.log(`    access_method: ${r.access_method}`)
    console.log(`    reloptions:    ${r.opts?.length ? r.opts.join(', ') : '(defaults: m=16, ef_construction=64)'}`)
    console.log(`    definition:    ${r.indexdef}`)
  }

  console.log('\n=== 2. Index size vs table size ===')
  const sizes = await sql<
    {
      relname: string
      table_size: string
      index_size: string
      table_bytes: number
      index_bytes: number
    }[]
  >`
    SELECT c.relname,
           pg_size_pretty(pg_relation_size(c.oid))                          AS table_size,
           pg_size_pretty(COALESCE(SUM(pg_relation_size(i.indexrelid)), 0)::bigint) AS index_size,
           pg_relation_size(c.oid)                                          AS table_bytes,
           COALESCE(SUM(pg_relation_size(i.indexrelid)), 0)::bigint         AS index_bytes
      FROM pg_class c
      LEFT JOIN pg_index i ON i.indrelid = c.oid
     WHERE c.relname IN ('rag_chunks', 'rag_video_cues')
       AND c.relkind = 'r'
     GROUP BY c.oid, c.relname
     ORDER BY c.relname
  `
  for (const r of sizes) {
    console.log(`  ${r.relname.padEnd(15)} table=${r.table_size.padEnd(10)} indexes=${r.index_size}`)
  }

  console.log('\n=== 3. Postgres memory config ===')
  const settings = await sql<{ name: string; setting: string; unit: string | null }[]>`
    SELECT name, setting, unit
      FROM pg_settings
     WHERE name IN ('shared_buffers', 'work_mem', 'effective_cache_size', 'maintenance_work_mem', 'max_parallel_workers_per_gather')
     ORDER BY name
  `
  for (const s of settings) {
    console.log(`  ${s.name.padEnd(35)} = ${s.setting}${s.unit ? ' ' + s.unit : ''}`)
  }

  console.log('\n=== 4. Cache hit ratio ===')
  // heap + index cache hit — should be > 99% at steady state
  const cache = await sql<
    { table: string; heap_hit_ratio: number | null; idx_hit_ratio: number | null }[]
  >`
    SELECT relname AS "table",
           CASE WHEN (heap_blks_hit + heap_blks_read) = 0 THEN NULL
                ELSE ROUND(100.0 * heap_blks_hit / (heap_blks_hit + heap_blks_read), 2)
           END AS heap_hit_ratio,
           CASE WHEN (idx_blks_hit + idx_blks_read) = 0 THEN NULL
                ELSE ROUND(100.0 * idx_blks_hit / (idx_blks_hit + idx_blks_read), 2)
           END AS idx_hit_ratio
      FROM pg_statio_user_tables
     WHERE relname IN ('rag_chunks', 'rag_video_cues', 'rag_sources')
     ORDER BY relname
  `
  for (const c of cache) {
    console.log(`  ${c.table.padEnd(15)} heap_hit=${c.heap_hit_ratio ?? 'n/a'}%  idx_hit=${c.idx_hit_ratio ?? 'n/a'}%`)
  }

  console.log('\n=== 5. Estimated in-memory footprint ===')
  const counts = await sql<{ chunks: number; video_cues: number }[]>`
    SELECT (SELECT COUNT(*)::int FROM rag_chunks)     AS chunks,
           (SELECT COUNT(*)::int FROM rag_video_cues) AS video_cues
  `
  const c0 = counts[0]!
  // Rough estimate: HNSW stores vector (dims × 4 bytes) + graph edges (m × 4 bytes × 2 layers on average)
  const DIMS = 1536
  const DEFAULT_M = 16
  const bytesPerRow = DIMS * 4 + DEFAULT_M * 4 * 2
  const totalChunkVectors = c0.chunks * bytesPerRow
  const totalCueVectors = c0.video_cues * bytesPerRow
  const mb = (b: number) => (b / (1024 * 1024)).toFixed(2)
  console.log(`  Rough per-row cost (1536 dims + HNSW graph, m=16): ${bytesPerRow.toLocaleString()} bytes`)
  console.log(`  chunks:     ${c0.chunks} rows × ${bytesPerRow} B = ${mb(totalChunkVectors)} MB`)
  console.log(`  video_cues: ${c0.video_cues} rows × ${bytesPerRow} B = ${mb(totalCueVectors)} MB`)
  console.log(`  Total estimated HNSW footprint: ${mb(totalChunkVectors + totalCueVectors)} MB`)
  console.log(`  (Compare vs shared_buffers above — index should fit comfortably in RAM.)`)

  console.log('\n=== 6. Current hnsw.ef_search value ===')
  const efSearch = await sql<{ setting: string; source: string }[]>`
    SELECT setting, source FROM pg_settings WHERE name = 'hnsw.ef_search'
  `
  if (efSearch[0]) {
    console.log(`  hnsw.ef_search = ${efSearch[0].setting} (source: ${efSearch[0].source})`)
    console.log(`  Default is 40. Higher = more thorough scan, slower. Lower = faster, less recall.`)
    console.log(`  Set per session: SET hnsw.ef_search = 100;   (or per DB via ALTER DATABASE)`)
  } else {
    console.log('  hnsw.ef_search not registered — index unused so far, or extension not loaded.')
  }

  await sql.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
