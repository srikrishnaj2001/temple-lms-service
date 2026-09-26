import { createHash } from 'node:crypto'

/**
 * In-memory LRU cache for full ask-flow responses. Key is the trimmed query
 * plus the retrieval scope + options that would affect the answer. TTL is
 * short by default (30 min) so content updates via the admin API surface
 * quickly enough for a POC/demo environment.
 *
 * On cache hit, the SSE handler replays the stored events synchronously — the
 * client sees the same event sequence (retrieval → answer → validation → done)
 * as a fresh call, just in milliseconds instead of seconds. That keeps the
 * frontend rendering logic unchanged.
 *
 * When we scale horizontally, replace with Redis.
 */

export interface CachedResponse {
  retrievalEvent: unknown
  answerText: string
  answerEvent: unknown
  validationEvent: unknown
}

interface CacheEntry {
  value: CachedResponse
  expiresAt: number
}

const TTL_MS = Number(process.env.ANSWER_CACHE_TTL_MS ?? String(30 * 60_000))
const MAX_ENTRIES = Number(process.env.ANSWER_CACHE_MAX_ENTRIES ?? '500')
const cache = new Map<string, CacheEntry>()

export function cacheKey(input: {
  query: string
  courseIds?: number[]
  options?: Record<string, unknown>
}): string {
  const h = createHash('sha256')
  h.update(input.query.trim().toLowerCase())
  h.update('\0')
  h.update(JSON.stringify(input.courseIds ?? null))
  h.update('\0')
  // Only options that change what the answer is get hashed. Rerank changes
  // ordering enough to matter; useKeyword changes candidates. escalate is
  // deterministic given retrieval, so it's fine to include.
  h.update(
    JSON.stringify({
      useKeyword: input.options?.useKeyword ?? true,
      useRerank: input.options?.useRerank ?? false,
      escalateOnLowConfidence: input.options?.escalateOnLowConfidence ?? true,
    }),
  )
  return h.digest('hex')
}

export function getCached(key: string): CachedResponse | undefined {
  const entry = cache.get(key)
  if (!entry) return undefined
  if (entry.expiresAt < Date.now()) {
    cache.delete(key)
    return undefined
  }
  // LRU refresh: re-insert to move to the end
  cache.delete(key)
  cache.set(key, entry)
  return entry.value
}

export function putCached(key: string, value: CachedResponse): void {
  if (cache.size >= MAX_ENTRIES) {
    // Evict oldest (first-inserted after LRU refreshes moved actives to the end)
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS })
}

/** Clear the cache — call after admin content updates in the future. */
export function invalidateCache(): void {
  cache.clear()
}

export function cacheStats() {
  return { size: cache.size, maxEntries: MAX_ENTRIES, ttlMs: TTL_MS }
}
