import { rawSql } from '../db/client.js'

const sql = rawSql()
const rows = await sql<
  { id: string; source_id: string; heading_trail: string[]; snippet: string }[]
>`SELECT id,
         "sourceId"     AS source_id,
         "headingTrail" AS heading_trail,
         LEFT(text, 100) AS snippet
    FROM rag_chunks ORDER BY "sourceId", ordinal`
for (const r of rows) {
  const heads = (r.heading_trail ?? []).join(' > ')
  console.log(`${r.id}  |  ${heads}  |  ${r.snippet.replace(/\s+/g, ' ')}`)
}
await sql.end()
