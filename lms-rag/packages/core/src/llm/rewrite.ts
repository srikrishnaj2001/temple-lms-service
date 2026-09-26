import { withRetry } from './client.js'
import { chatComplete } from './openrouter.js'
import { MODELS } from './models.js'

export interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface RewriteResult {
  /** normalised query, glossary-aware, references resolved from history. */
  rewritten: string
  /** HyDE — hypothetical answer for dense retrieval */
  hyde: string
}

const REWRITE_SYSTEM = `You rewrite user questions about Hindu temple operations training for retrieval.
Return a JSON object: {"rewritten": string, "hyde": string}.
- "rewritten": a clear, standalone version of the question. If prior conversation is supplied, RESOLVE any references ("it", "them", "the first one", "that", pronouns) using the earlier turns so the rewritten query stands alone with no context needed. Expand acronyms and correct spelling of domain terms (seva, prasad, annadaan, aarti, darshan, panchang, murti, mahaprasadam). Do NOT invent facts.
- "hyde": a plausible 2-3 sentence answer as if from the training material. This is used ONLY for dense retrieval — factual accuracy does not matter, topical plausibility does.
Return only the JSON, no prose around it.`

/**
 * Well-formed = at least 6 words, ends in `?` or a period, no obvious typos.
 * When this returns true AND there is no conversation history, we skip the
 * fast rewrite entirely and save ~1s per query. History always forces a
 * rewrite because references ("the first one", "it", "them") need resolution.
 */
function shouldSkipRewrite(query: string, history: ConversationTurn[] = []): boolean {
  if (history.length > 0) return false
  const mode = (process.env.SKIP_REWRITE_HEURISTIC ?? 'auto').toLowerCase()
  if (mode === 'never' || mode === 'off') return false
  if (mode === 'always') return true
  const words = query.trim().split(/\s+/).filter(Boolean)
  if (words.length < 6) return false
  return /[?.!]$/.test(query.trim())
}

function formatHistory(history: ConversationTurn[]): string {
  if (!history.length) return ''
  const lines = history
    .slice(-10)
    .map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`)
    .join('\n')
  return `Prior conversation (most recent last):\n${lines}\n\n`
}

export async function rewriteAndHyde(
  query: string,
  history: ConversationTurn[] = [],
): Promise<RewriteResult> {
  if (shouldSkipRewrite(query, history)) {
    return { rewritten: query.trim(), hyde: query.trim() }
  }
  const historyBlock = formatHistory(history)
  const res = await withRetry(() =>
    chatComplete({
      model: MODELS.fast,
      messages: [
        { role: 'system', content: REWRITE_SYSTEM },
        { role: 'user', content: `${historyBlock}Current question: ${query}` },
      ],
      temperature: 0.2,
      json: true,
    }),
  )
  let parsed: RewriteResult
  try {
    parsed = JSON.parse(res.text) as RewriteResult
  } catch {
    return { rewritten: query.trim(), hyde: query.trim() }
  }
  return {
    rewritten: parsed.rewritten?.trim() || query,
    hyde: parsed.hyde?.trim() || query,
  }
}
