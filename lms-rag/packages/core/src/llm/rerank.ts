import { withRetry } from './client.js'
import { chatComplete } from './openrouter.js'
import { MODELS } from './models.js'

export interface RerankCandidate {
  id: string
  headingTrail: string[]
  rawText: string
}

export interface RerankOptions {
  topK?: number
  maxPassageChars?: number
}

/**
 * LLM reranker. Batch ALL candidates into one call; return indices only so
 * output tokens stay tiny (~50ms of generation vs 30 round trips).
 *
 * Compare against no-rerank AND a local Xenova cross-encoder in the eval
 * harness — the local model may be both faster and better, and it doesn't
 * burn quota.
 */
export async function llmRerank(
  query: string,
  candidates: RerankCandidate[],
  opts: RerankOptions = {},
): Promise<RerankCandidate[]> {
  if (candidates.length === 0) return []
  const topK = Math.min(opts.topK ?? 10, candidates.length)
  const maxChars = opts.maxPassageChars ?? 400

  const userPrompt = `Question: ${query}

Passages:
${candidates
  .map(
    (c, i) =>
      `[${i}] ${c.headingTrail.join(' > ')}\n${truncate(c.rawText, maxChars)}`,
  )
  .join('\n\n')}

Return a JSON object {"indices": [i1, i2, ...]} with the ${topK} most relevant passage indices, most relevant first. Return only the JSON.`

  const res = await withRetry(() =>
    chatComplete({
      model: MODELS.fast,
      messages: [
        {
          role: 'system',
          content:
            'You rank passages by relevance to a query. Return only a JSON object with an "indices" array of integers.',
        },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0,
      json: true,
    }),
  )

  let parsed: { indices: number[] }
  try {
    parsed = JSON.parse(res.text || '{"indices":[]}') as { indices: number[] }
  } catch {
    parsed = { indices: [] }
  }
  const seen = new Set<number>()
  const ordered: RerankCandidate[] = []
  for (const i of parsed.indices ?? []) {
    if (i >= 0 && i < candidates.length && !seen.has(i)) {
      seen.add(i)
      ordered.push(candidates[i]!)
      if (ordered.length >= topK) break
    }
  }
  return ordered
}

function truncate(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n) + '...'
}
