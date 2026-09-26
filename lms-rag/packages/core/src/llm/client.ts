/**
 * Retry policy for LLM calls (OpenRouter chat + Gemini embeddings).
 *
 * On 429, honour a hinted retry-after (either a "retry in Xs" hint in the
 * error message body or a numeric header captured by the caller). Fall back
 * to exponential backoff 2s → 4s → 8s → ... capped at 90s so a hung
 * retry-after doesn't stall the pipeline.
 */
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504])
const DEFAULT_ATTEMPTS = 8
const MAX_RETRY_DELAY_MS = 90_000

export interface RetryOptions {
  attempts?: number
  baseMs?: number
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? DEFAULT_ATTEMPTS
  const baseMs = opts.baseMs ?? 2000

  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!isRetryable(err) || i === attempts - 1) throw err
      const hinted = extractRetryDelayMs(err)
      const backoff = baseMs * 2 ** i
      const delay = Math.min(MAX_RETRY_DELAY_MS, hinted ?? backoff)
      opts.onRetry?.(err, i + 1, delay)
      await sleep(delay)
    }
  }
  throw lastErr
}

function isRetryable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const anyErr = err as { status?: number; code?: number; message?: string }
  if (anyErr.status && RETRY_STATUSES.has(anyErr.status)) return true
  if (anyErr.code && RETRY_STATUSES.has(anyErr.code)) return true
  const msg = anyErr.message?.toLowerCase() ?? ''
  return (
    msg.includes('rate limit') ||
    msg.includes('429') ||
    msg.includes('unavailable') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('overloaded')
  )
}

/**
 * Parse a suggested retry delay from the error body.
 * Handles both provider hints ("retry in Xs") and structured RetryInfo.
 * Returns milliseconds, or undefined if no hint is present.
 */
function extractRetryDelayMs(err: unknown): number | undefined {
  const msg = (err as { message?: string }).message
  if (!msg) return undefined
  const m = /retry in (\d+(?:\.\d+)?)(ms|s)/i.exec(msg)
  if (m) {
    const n = Number(m[1])
    return m[2] === 's' ? Math.ceil(n * 1000) : Math.ceil(n)
  }
  const s = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(msg)
  if (s) return Math.ceil(Number(s[1]) * 1000)
  return undefined
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
