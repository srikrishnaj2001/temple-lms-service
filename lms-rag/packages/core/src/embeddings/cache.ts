import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { config } from '../config.js'

/**
 * On-disk embedding cache keyed by hash(model + taskType + dims + text).
 * Cache is essential now, not optional (§7a): free-tier daily caps are
 * the binding constraint and re-running the eval three times without
 * a cache exhausts quota.
 */
export function contentHash(input: {
  model: string
  taskType: string
  dims: number
  text: string
}): string {
  const h = createHash('sha256')
  h.update(input.model)
  h.update('\0')
  h.update(input.taskType)
  h.update('\0')
  h.update(String(input.dims))
  h.update('\0')
  h.update(input.text)
  return h.digest('hex')
}

function pathFor(hash: string): string {
  const base = config().EMBEDDING_CACHE_DIR
  // shard by first 2 chars to keep any single dir manageable
  return join(base, hash.slice(0, 2), `${hash}.json`)
}

export async function getCached(hash: string): Promise<number[] | undefined> {
  const p = pathFor(hash)
  if (!existsSync(p)) return undefined
  try {
    const raw = await readFile(p, 'utf-8')
    const parsed = JSON.parse(raw) as { v: number[] }
    return parsed.v
  } catch {
    return undefined
  }
}

export async function putCached(hash: string, vector: number[]): Promise<void> {
  const p = pathFor(hash)
  await mkdir(dirname(p), { recursive: true })
  await writeFile(p, JSON.stringify({ v: vector }), 'utf-8')
}
