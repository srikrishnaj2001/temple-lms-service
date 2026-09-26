import { rawSql } from '../db/client.js'

const sql = rawSql()
const rows = await sql<
  { video_id: number; cue_id: string; start_sec: number; text: string }[]
>`SELECT "videoId"  AS video_id,
         "cueId"    AS cue_id,
         "startSec" AS start_sec,
         text
    FROM rag_video_cues
   ORDER BY "videoId", "startSec"
   LIMIT 20`
for (const r of rows) {
  console.log(`${r.video_id} #${r.cue_id} @${r.start_sec}s: ${r.text}`)
}
await sql.end()
