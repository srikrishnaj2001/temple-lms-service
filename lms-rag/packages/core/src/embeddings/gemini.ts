import { GoogleGenAI } from '@google/genai'
import { withRetry } from '../llm/client.js'
import { MODELS } from '../llm/models.js'
import { config } from '../config.js'
import { contentHash, getCached, putCached } from './cache.js'

/**
 * Google GenAI client — used only for embeddings. Chat completions are
 * routed through OpenRouter (see llm/openrouter.ts).
 */
let cachedClient: GoogleGenAI | undefined
function genai(): GoogleGenAI {
  if (!cachedClient) cachedClient = new GoogleGenAI({ apiKey: config().GEMINI_API_KEY })
  return cachedClient
}

/**
 * 1536 dims via Matryoshka truncation halves storage against the 3072 default
 * with a controlled quality trade-off. For gemini-embedding-001, truncation
 * below 3072 REQUIRES manual L2 normalisation — skip it and cosine distances
 * are quietly wrong.
 */
export const DIMS = 1536

export type TaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'

/** Gemini input cap for gemini-embedding-001. Chunks target 350-500 tokens;
 *  atomic-unit rule (never split a table) could occasionally produce oversized
 *  chunks — assert in the chunker rather than discovering it as a runtime 400. */
export const MAX_INPUT_TOKENS = 2048

export interface EmbedOptions {
  taskType: TaskType
  batchSize?: number
  /** if true, skip cache (rare — used for benchmarking) */
  noCache?: boolean
}

/**
 * Free-tier embed limit is 100 requests/minute. Batches with N items count
 * as 1 request each, but we throttle at the batch level to leave headroom
 * for concurrent ops (rewrites during eval, video correction, etc.).
 * ~1200ms between batches ≈ 50 batches/min = safely under the cap.
 * Override via GEMINI_EMBED_MIN_INTERVAL_MS in .env once billing is enabled.
 */
const MIN_EMBED_INTERVAL_MS = Number(process.env.GEMINI_EMBED_MIN_INTERVAL_MS ?? '1200')
let lastEmbedAt = 0
async function throttleEmbed() {
  const now = Date.now()
  const wait = lastEmbedAt + MIN_EMBED_INTERVAL_MS - now
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastEmbedAt = Date.now()
}

export async function embed(texts: string[], opts: EmbedOptions): Promise<number[][]> {
  const results: number[][] = new Array(texts.length)
  const uncached: { index: number; text: string; hash: string }[] = []

  if (!opts.noCache) {
    await Promise.all(
      texts.map(async (text, i) => {
        const h = contentHash({ model: MODELS.embed, taskType: opts.taskType, dims: DIMS, text })
        const hit = await getCached(h)
        if (hit) {
          results[i] = hit
        } else {
          uncached.push({ index: i, text, hash: h })
        }
      }),
    )
  } else {
    texts.forEach((text, i) => {
      const h = contentHash({ model: MODELS.embed, taskType: opts.taskType, dims: DIMS, text })
      uncached.push({ index: i, text, hash: h })
    })
  }

  const batchSize = opts.batchSize ?? 100
  for (let start = 0; start < uncached.length; start += batchSize) {
    const batch = uncached.slice(start, start + batchSize)
    await throttleEmbed()
    const res = await withRetry(() =>
      genai().models.embedContent({
        model: MODELS.embed,
        contents: batch.map((b) => ({ role: 'user', parts: [{ text: b.text }] })),
        config: {
          taskType: opts.taskType,
          outputDimensionality: DIMS,
        },
      }),
    )
    const embeds = res.embeddings ?? []
    if (embeds.length !== batch.length) {
      throw new Error(
        `Gemini returned ${embeds.length} embeddings for ${batch.length} inputs — refusing to silently misalign`,
      )
    }
    for (let i = 0; i < batch.length; i++) {
      const raw = embeds[i]!.values ?? []
      const v = l2normalize(raw)
      results[batch[i]!.index] = v
      if (!opts.noCache) await putCached(batch[i]!.hash, v)
    }
  }

  return results
}

export async function embedOne(text: string, taskType: TaskType): Promise<number[]> {
  const [v] = await embed([text], { taskType })
  return v!
}

export function l2normalize(v: number[]): number[] {
  let sum = 0
  for (const x of v) sum += x * x
  const n = Math.sqrt(sum)
  if (n === 0) return v.slice()
  const out = new Array<number>(v.length)
  for (let i = 0; i < v.length; i++) out[i] = v[i]! / n
  return out
}
