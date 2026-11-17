import { withRetry } from './client.js'
import { chatComplete, chatCompleteStream, type ChatMessage } from './openrouter.js'
import { MODELS } from './models.js'
import { config } from '../config.js'

export type Confidence = 'high' | 'medium' | 'low'

export interface Citation {
  id: string
  chunkId: string
}

export interface WatchNext {
  videoId: number
  startSec: number
  reason: string
}

export interface AnswerJson {
  answer: string
  confidence: Confidence
  citations: Citation[]
  watchNext?: WatchNext[]
  readNext?: string[]
  followUps?: string[]
}

export interface ContextChunk {
  id: string
  chunkId: string
  headingTrail: string[]
  sourceTitle: string
  text: string
  videoId?: number
  startSec?: number
}

const SYSTEM = `You are a friendly chatbot for a Hindu temple operations training LMS. Answer the user's question directly and conversationally, like a knowledgeable colleague.

STYLE RULES (strict):
- Be concise. Aim for 2-4 short paragraphs OR a compact bulleted list. Overviews should be 100-180 words, factual answers 40-80 words. Only exceed this if the user explicitly asks for detail.
- Write natural prose. DO NOT put "(id: k1, chunkId: ...)" or any raw context labels inside the answer text. Citations belong ONLY in the "citations" JSON field, never inside "answer".
- Use plain formatting — short sentences, bullet points if helpful, no markdown code fences, no long section headers.
- Answer ONLY from the supplied context. If the context lacks the answer, say so briefly and set confidence to "low".
- Do NOT draft sample language or suggest what an answer "might be like" or offer "something you could say" when the context does not contain the information. Either ground on an excerpt or admit you don't see it in the materials — never invent a plausible-sounding middle ground. The server also enforces this: if your "citations" array is empty AND no catalogue/page excerpts are supplied, your "answer" will be replaced with a standard "I couldn't find that in the course library" message regardless of what you wrote. So just cite the chunks you used.
- When an excerpt's header is a Reading Library book page (sourceTitle contains "— Page N/M" and no "(video ...)" tag), you MAY name the book inline in prose (e.g. "According to the Strategy & Planning handbook, …"). Do NOT emit a citation entry for library pages — only video and course/module chunks go in the citations field.
- Reading Library content has sourceTitle in the form "<Book Title> — Page N/M" or "<Book Title> — Catalogue Entry". For "what books cover <topic>" questions, list ONLY the book titles that appear in the supplied excerpts (strip the "— Page" / "— Catalogue Entry" suffix, deduplicate). Hard rule: if a book title is not literally present in an excerpt sourceTitle, you MUST NOT include it in your answer. If no library excerpts are supplied, say you could not find a specific match in the retrieved excerpts and invite them to browse. Still no citation entry for library content.

JSON FIELDS:
- "answer": the clean user-facing text (no chunk IDs inline).
- "confidence": "high" | "medium" | "low".
- "citations": array of {id, chunkId} for every context chunk you used — this is the ONLY place chunk references go.
- "watchNext": MUST be a JSON ARRAY (use [] not {}). When the excerpts contain a video (any excerpt whose header includes "(video <id> @ <sec>s)"), include ONE entry pointing to the most relevant video. Fields per entry: {videoId (integer, copy from the excerpt header), startSec (integer, copy from the excerpt header), reason (short string, why this video answers the question)}. Only leave it as [] when NO video excerpt appears in the context OR every video excerpt is completely off-topic. Never fabricate a videoId — only use ids that appear verbatim in the excerpt headers.
- "readNext": chunkIds from the context the reader may find useful next.
- "followUps": 2-3 short follow-up questions the reader might ask.

Return a single JSON object with those fields. Do not include prose outside the JSON.`

export interface GenerateOptions {
  /** if true, route to strong model — used when rerank confidence is low */
  escalate?: boolean
}

export function buildContext(chunks: ContextChunk[]): string {
  return chunks
    .map(
      (c) =>
        `--- [id=${c.id} chunkId=${c.chunkId}] ${c.sourceTitle}${
          c.headingTrail.length ? ` > ${c.headingTrail.join(' > ')}` : ''
        }${c.videoId ? ` (video ${c.videoId} @ ${c.startSec ?? 0}s)` : ''} ---\n${c.text}`,
    )
    .join('\n\n')
}

/**
 * Extract the distinct Reading Library book titles that appear in the retrieved
 * chunks. `sourceTitle` for library chunks is "<Book Title> — Page N/M" (page
 * excerpts) or "<Book Title> — Catalogue Entry" (catalogue summaries). We strip
 * either suffix. Non-library chunks are ignored (course/module/video content
 * never matches). Return the de-duplicated list in first-seen order so the LLM
 * can only cite books whose chunks were actually retrieved.
 */
function extractLibraryBookTitles(chunks: ContextChunk[]): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const c of chunks) {
    const match = /^(.+?)\s+—\s+(Page\s+\d+\/\d+|Catalogue Entry)$/.exec(c.sourceTitle)
    if (!match) continue
    const title = match[1]!.trim()
    if (!seen.has(title)) {
      seen.add(title)
      ordered.push(title)
    }
  }
  return ordered
}

function buildMessages(query: string, contextBlock: string, chunks: ContextChunk[]): ChatMessage[] {
  // Inject an explicit allowlist of library book titles present in the context.
  // Prompt instructions alone don't stop Gemini from inventing titles when the
  // query shape is "which books cover X"; a hard-coded list in the user message
  // is far more durable. If no library chunks are retrieved the block is empty
  // and the LLM should say the library doesn't cover the topic.
  const allowedTitles = extractLibraryBookTitles(chunks)
  const allowlistBlock = allowedTitles.length
    ? `\n\nAllowed Reading Library book titles (do not name any book outside this list):\n${allowedTitles.map((t) => `- ${t}`).join('\n')}`
    : `\n\nNo Reading Library books were retrieved for this question. If the user asked for books, tell them you could not find a direct match in the retrieved excerpts and invite them to browse.`
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Context:\n${contextBlock}${allowlistBlock}\n\nQuestion: ${query}` },
  ]
}

export async function generateAnswer(
  query: string,
  chunks: ContextChunk[],
  opts: GenerateOptions = {},
): Promise<AnswerJson> {
  const model = opts.escalate && config().ENABLE_STRONG_ESCALATION ? MODELS.strong : MODELS.main
  const contextBlock = buildContext(chunks)

  const res = await withRetry(() =>
    chatComplete({
      model,
      messages: buildMessages(query, contextBlock, chunks),
      temperature: 0.2,
      json: true,
    }),
  )

  return enforceGroundedAnswer(safeParseAnswer(res.text), chunks)
}

/**
 * Server-side guardrail — the prompt tells the LLM "do not improvise when
 * context is empty", but prod voice logs showed the model confidently
 * fabricating a numbered answer with `confidence: "high"` and `citations: []`
 * for an empty-context call. That is the worst failure mode for a voice
 * agent: a learner acts on invented advice.
 *
 * This guard is authoritative: if retrieval returned zero chunks OR the LLM
 * failed to cite any of the chunks it was given, overwrite the answer with
 * a fixed honesty sentence and lower confidence. The LLM's answer is
 * discarded in that case — it was improvising, not grounding.
 */
/**
 * Minimum chunk text length to count as "substantive" (groundable). Video
 * cues are 20–40 char subtitle fragments that cannot support a factual
 * answer — the LLM treats them as context, returns an answer, but is
 * actually improvising from training data. This threshold filters them out.
 */
const SUBSTANTIVE_MIN_CHARS = 100

/**
 * Returns the subset of context that is substantive enough to support a
 * grounded answer. Used both by `enforceGroundedAnswer` (post-generation
 * check in /ask/sync) and by the SSE `/ask` route's pre-generation
 * short-circuit — if this returns empty, we can skip the LLM entirely and
 * stream back a single honest message, saving a token round-trip and
 * removing any chance of hallucination.
 */
export function substantiveChunks(chunks: ContextChunk[]): ContextChunk[] {
  return chunks.filter(
    (c) => c.videoId == null && (c.text?.length ?? 0) >= SUBSTANTIVE_MIN_CHARS,
  )
}

/** Fixed response the empty-context guard emits — single source of truth so
 *  the SSE short-circuit and the /ask/sync post-check emit identical text. */
export const EMPTY_CONTEXT_ANSWER =
  "I couldn't find that in the course library — could you rephrase, or ask about a different topic?"

export function enforceGroundedAnswer(
  parsed: AnswerJson,
  chunks: ContextChunk[],
): AnswerJson {
  // Prod voice logs showed the LLM confidently hallucinating 447-char
  // numbered lists with `citations: []` when retrieval returned only video
  // cues. `substantiveChunks` strips those cues so the guard sees empty
  // context and overrides correctly.
  const substantive = substantiveChunks(chunks)
  const groundable = substantive.length > 0
  const grounded = Array.isArray(parsed.citations) && parsed.citations.length > 0
  // Library answers legitimately carry empty citations (the schema reserves
  // citations for course/module/video chunks; library answers reference
  // books in prose, see the library allowlist rule).
  const hasLibraryExcerpt = substantive.some((c) =>
    /— (Page \d+\/\d+|Catalogue Entry)$/.test(c.sourceTitle),
  )
  if (!groundable) {
    return {
      ...parsed,
      answer: EMPTY_CONTEXT_ANSWER,
      confidence: 'low',
      citations: [],
      watchNext: [],
      readNext: [],
      followUps: ['What topics are covered in this course library?'],
    }
  }
  if (!grounded && !hasLibraryExcerpt) {
    // Chunks WERE returned but the LLM didn't cite any — a sign it ignored
    // the context and improvised instead. Treat the same as empty context.
    return {
      ...parsed,
      answer:
        "I couldn't find a direct answer in your training materials — could you rephrase, or ask about a related topic?",
      confidence: 'low',
      watchNext: [],
    }
  }
  return parsed
}

export interface StreamAnswerOptions extends GenerateOptions {
  /**
   * Called when the streaming call is retried after a 429/5xx. Used by the
   * API layer to emit a "model is busy, retrying" stage event so the UI can
   * show a specific label instead of a generic wait.
   */
  onRetry?: (attempt: number, delayMs: number) => void
}

export async function* streamAnswer(
  query: string,
  chunks: ContextChunk[],
  opts: StreamAnswerOptions = {},
): AsyncGenerator<string> {
  const model = opts.escalate && config().ENABLE_STRONG_ESCALATION ? MODELS.strong : MODELS.main
  const contextBlock = buildContext(chunks)

  // Wrap only the stream-open in withRetry — the initial handshake can 429,
  // and if it does we want the same backoff-with-hint behaviour as one-shot
  // calls. Once the stream is open, individual chunks can't be retried; a
  // mid-stream failure bubbles up to the caller as-is.
  const stream = await withRetry(
    () =>
      Promise.resolve(
        chatCompleteStream({
          model,
          messages: buildMessages(query, contextBlock, chunks),
          temperature: 0.2,
          json: true,
        }),
      ),
    {
      onRetry: (_err, attempt, delayMs) => opts.onRetry?.(attempt, delayMs),
    },
  )

  for await (const token of stream) {
    if (token) yield token
  }
}

function safeParseAnswer(raw: string): AnswerJson {
  const stripped = stripCodeFences(raw).trim() || '{}'
  try {
    return JSON.parse(stripped) as AnswerJson
  } catch {
    // Model returned text that isn't valid JSON — surface as a low-confidence
    // answer rather than throwing so the UI shows something.
    return {
      answer: stripped,
      confidence: 'low',
      citations: [],
    }
  }
}

/** Some models wrap JSON in ```json fences despite the response_format hint. */
function stripCodeFences(s: string): string {
  const trimmed = s.trim()
  if (trimmed.startsWith('```')) {
    const first = trimmed.indexOf('\n')
    const last = trimmed.lastIndexOf('```')
    if (first > 0 && last > first) return trimmed.slice(first + 1, last).trim()
  }
  return trimmed
}
