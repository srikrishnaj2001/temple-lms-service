import { rawSql } from '../db/client.js'
const sql = rawSql()
const s = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM rag_sources WHERE kind = 'document'`
const c = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM rag_chunks`
console.log(`sources (document): ${s[0]?.n}`)
console.log(`chunks: ${c[0]?.n}`)
await sql.end()
