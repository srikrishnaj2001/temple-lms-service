import { rawSql } from '../db/client.js'

/**
 * Wipes all RAG-ingested content — rag_chunks, rag_video_cues, rag_sources,
 * rag_glossary, rag_ingest_jobs — from the shared lms-service Postgres.
 * Use before switching from fixture content to real client corpus so eval
 * numbers aren't polluted.
 *
 * Safe: only rag_* rows are touched. lms-service tables (tenants, courses,
 * modules, contents, videos, users) are NEVER modified by this script.
 */
const args = process.argv.slice(2)
const yes = args.includes('--yes') || args.includes('-y')

async function main() {
  if (!yes) {
    console.log(
      'This will DELETE all rows in rag_sources, rag_chunks, rag_video_cues, rag_glossary, rag_ingest_jobs.',
    )
    console.log('lms-service tables (courses, modules, contents, videos, tenants, users) are NOT touched.')
    console.log('Re-run with --yes to confirm.')
    process.exit(1)
  }

  const sql = rawSql()
  console.log('[reset] truncating rag_* content tables...')
  await sql`TRUNCATE TABLE rag_chunks, rag_video_cues, rag_sources, rag_glossary, rag_ingest_jobs RESTART IDENTITY CASCADE`
  console.log('  done')

  await sql.end()
  console.log('[reset] done')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
