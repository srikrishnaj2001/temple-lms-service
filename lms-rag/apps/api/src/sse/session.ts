import { randomUUID } from 'node:crypto'

/**
 * POST-then-GET SSE session store (§5 in the plan). Reasons for the split:
 * - React Native's EventSource shim only supports GET, no body
 * - Puts the expensive prompt build behind a POST body (no URL length limits)
 * - Trivial to add auth to POST + short-lived opaque token for GET
 *
 * Sessions expire ~5 minutes after creation. Held in-process only — no
 * horizontal scaling in the POC. When we scale, swap for Redis.
 */

export interface AskSession {
  id: string
  createdAt: number
  query: string
  options: unknown
  /** stream — resolved once the retrieval runs */
  stream?: AsyncGenerator<string>
  /** final payload (citations, watchNext, ...) — sent after the stream ends */
  finalize?: () => Promise<Record<string, unknown>>
  consumed?: boolean
}

const TTL_MS = 5 * 60 * 1000
const sessions = new Map<string, AskSession>()

export function createSession(query: string, options: unknown): AskSession {
  gc()
  const session: AskSession = {
    id: randomUUID(),
    createdAt: Date.now(),
    query,
    options,
  }
  sessions.set(session.id, session)
  return session
}

export function getSession(id: string): AskSession | undefined {
  gc()
  return sessions.get(id)
}

export function deleteSession(id: string): void {
  sessions.delete(id)
}

function gc() {
  const cutoff = Date.now() - TTL_MS
  for (const [id, s] of sessions) {
    if (s.createdAt < cutoff) sessions.delete(id)
  }
}
