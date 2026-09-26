/**
 * OpenRouter chat client (OpenAI-compatible /chat/completions).
 *
 * Handles both one-shot and streamed (SSE) responses in a shape that mirrors
 * the previous Google `genai().models.generateContent[Stream]` return — so
 * caller code reads almost identically to the Gemini version.
 *
 * Embeddings are NOT here — OpenRouter doesn't do embeddings. Those still go
 * through `embeddings/gemini.ts` against the Gemini embedding-001 endpoint.
 */
import { config } from '../config.js'

const OPENROUTER_BASE = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatCompleteOptions {
  model: string
  messages: ChatMessage[]
  /** 0..2. Defaults to 0.2 (matches previous Gemini call sites). */
  temperature?: number
  /** Request JSON-only output. Applied via response_format={type:'json_object'}. */
  json?: boolean
  /** Optional signal for cancellation. */
  signal?: AbortSignal
}

/** Non-streaming completion. Returns the assistant text (may be JSON string). */
export async function chatComplete(opts: ChatCompleteOptions): Promise<{ text: string }> {
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.2,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      stream: false,
    }),
    signal: opts.signal,
  })
  if (!res.ok) throw await httpError(res)
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
    error?: { message?: string }
  }
  const text = body.choices?.[0]?.message?.content ?? ''
  return { text }
}

/**
 * Streaming completion — yields text deltas as they arrive.
 *
 * OpenRouter streams SSE lines shaped `data: {"choices":[{"delta":{"content":"..."}}]}`
 * terminated by `data: [DONE]`. We buffer partial lines and forward each
 * delta's content.
 */
export async function* chatCompleteStream(
  opts: ChatCompleteOptions,
): AsyncGenerator<string> {
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      ...buildHeaders(),
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.2,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      stream: true,
    }),
    signal: opts.signal,
  })
  if (!res.ok) throw await httpError(res)
  if (!res.body) throw new Error('openrouter stream: missing response body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // Split on double-newline (SSE event delimiter). Keep the trailing partial
      // event in the buffer for the next chunk.
      let sep: number
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        for (const line of rawEvent.split('\n')) {
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (payload === '[DONE]') return
          if (!payload) continue
          try {
            const parsed = JSON.parse(payload) as {
              choices?: { delta?: { content?: string } }[]
            }
            const delta = parsed.choices?.[0]?.delta?.content
            if (delta) yield delta
          } catch {
            // Malformed SSE line — skip. OpenRouter sometimes emits comments
            // (`: keep-alive`) which aren't valid JSON and aren't `data:`.
          }
        }
      }
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      /* ignore */
    }
  }
}

function buildHeaders(): Record<string, string> {
  const cfg = config()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cfg.OPENROUTER_API_KEY}`,
  }
  // OpenRouter recommends these for analytics + rate-limit fairness across apps.
  if (process.env.OPENROUTER_REFERRER) headers['HTTP-Referer'] = process.env.OPENROUTER_REFERRER
  if (process.env.OPENROUTER_APP_TITLE) headers['X-Title'] = process.env.OPENROUTER_APP_TITLE
  return headers
}

async function httpError(res: Response): Promise<Error> {
  let bodyText = ''
  try {
    bodyText = await res.text()
  } catch {
    /* ignore */
  }
  const err = new Error(
    `openrouter ${res.status} ${res.statusText}${bodyText ? `: ${bodyText.slice(0, 500)}` : ''}`,
  ) as Error & { status?: number }
  err.status = res.status
  return err
}
