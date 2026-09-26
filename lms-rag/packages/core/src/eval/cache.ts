import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { config } from '../config.js'

/**
 * LLM response cache for eval runs. Keyed by hash(model + prompt + tools).
 * Essential for the "3 eval runs of 50 questions" workflow in §7a of the
 * plan — without it, comparing configs (rerank on/off, etc.) re-spends
 * quota for the same prompts.
 *
 * Not used in the API path — only in the eval harness — because production
 * traffic must not be cached silently.
 */

export function evalCacheKey(input: {
  model: string
  prompt: string
  schema?: unknown
}): string {
  const h = createHash('sha256')
  h.update(input.model)
  h.update('\0')
  h.update(input.prompt)
  h.update('\0')
  h.update(JSON.stringify(input.schema ?? null))
  return h.digest('hex')
}

function pathFor(key: string): string {
  return join(config().EVAL_LLM_CACHE_DIR, key.slice(0, 2), `${key}.json`)
}

export async function getEvalCache<T>(key: string): Promise<T | undefined> {
  const p = pathFor(key)
  if (!existsSync(p)) return undefined
  try {
    const raw = await readFile(p, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return undefined
  }
}

export async function putEvalCache(key: string, value: unknown): Promise<void> {
  const p = pathFor(key)
  await mkdir(dirname(p), { recursive: true })
  await writeFile(p, JSON.stringify(value), 'utf-8')
}
