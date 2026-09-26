import { readFile } from 'node:fs/promises'
import { z } from 'zod'

const GoldenItemSchema = z.object({
  id: z.string(),
  question: z.string().min(1),
  /** chunkIds that MUST appear in retrieval for this question to count as recall-hit */
  goldChunkIds: z.array(z.string()).default([]),
  /** videoIds that SHOULD appear in top-3 watchNext for video-hit@3 (integer ids from lms-service videos.id) */
  goldVideoIds: z
    .array(z.union([z.number().int(), z.string().regex(/^\d+$/)]))
    .default([])
    .transform((arr) => arr.map((v) => (typeof v === 'number' ? v : Number(v)))),
  /** free-text notes from the domain reviewer */
  notes: z.string().optional(),
  /** tags: intent (howto/factual/policy), skill_level, priority */
  tags: z.record(z.string(), z.string()).default({}),
})

const GoldenSetSchema = z.array(GoldenItemSchema)

export type GoldenItem = z.infer<typeof GoldenItemSchema>
export type GoldenSet = z.infer<typeof GoldenSetSchema>

export async function loadGoldenSet(path: string): Promise<GoldenSet> {
  const raw = await readFile(path, 'utf-8')
  return GoldenSetSchema.parse(JSON.parse(raw))
}
