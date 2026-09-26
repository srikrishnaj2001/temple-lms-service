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

function buildMessages(query: string, contextBlock: string): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Context:\n${contextBlock}\n\nQuestion: ${query}` },
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
      messages: buildMessages(query, contextBlock),
      temperature: 0.2,
      json: true,
    }),
  )

  return safeParseAnswer(res.text)
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
          messages: buildMessages(query, contextBlock),
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
