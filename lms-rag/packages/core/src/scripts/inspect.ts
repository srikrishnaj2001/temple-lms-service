import { rawSql } from '../db/client.js'

const sql = rawSql()
const s = await sql<{ id: string; title: string; kind: string }[]>`
  SELECT id, title, kind FROM rag_sources ORDER BY id
`
console.log('=== rag_sources ===')
for (const r of s) console.log(`  ${r.kind.padEnd(10)} ${r.id}  |  ${r.title}`)

const c = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM rag_chunks`
console.log(`\n=== total chunks: ${c[0]?.n} ===`)

const term = process.argv[2] ?? 'treasury'
const t = await sql<{ id: string; snippet: string }[]>`
  SELECT id, LEFT(text, 200) as snippet FROM rag_chunks WHERE text ILIKE ${'%' + term + '%'} LIMIT 10
`
console.log(`\n=== chunks mentioning "${term}" (${t.length}) ===`)
for (const r of t) console.log(`  ${r.id}  |  ${r.snippet.replace(/\s+/g, ' ')}`)

await sql.end()
