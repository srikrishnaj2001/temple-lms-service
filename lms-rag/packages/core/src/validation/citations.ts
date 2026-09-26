import type { AnswerJson, ContextChunk } from '../llm/generate.js'
import type { FusedVideoCue } from '../retrieval/hybrid.js'

export interface ValidationReport {
  original: AnswerJson
  cleaned: AnswerJson
  droppedCitations: number
  droppedWatchNext: number
  droppedReadNext: number
  invalidChunkIds: string[]
  invalidVideoIds: number[]
  /** should be 100 in eval — anything less is a bug */
  citationValidityPct: number
}

/**
 * Post-flight validator. `responseSchema` guarantees shape, not truth: the
 * model can still hallucinate a chunkId or videoId that wasn't in context.
 * Validate every reference against the supplied candidate sets and drop
 * anything that doesn't match. This check MUST stay at 100% in the eval —
 * anything less means a bug.
 */
export function validateAnswer(
  answer: AnswerJson,
  contextChunks: ContextChunk[],
  contextVideoCues: FusedVideoCue[],
): ValidationReport {
  const chunkIdSet = new Set<string>(contextChunks.map((c) => c.chunkId))
  const videoIdSet = new Set<number>(contextVideoCues.map((v) => v.videoId))
  // videos may also be referenced from chunks (a doc mentioning a video by id)
  contextChunks.forEach((c) => {
    if (c.videoId != null) videoIdSet.add(c.videoId)
  })

  const invalidChunkIds: string[] = []
  const invalidVideoIds: number[] = []

  const rawCitations = asArray(answer.citations) as AnswerJson['citations']
  const rawWatchNext = asArray(answer.watchNext) as NonNullable<AnswerJson['watchNext']>
  const rawReadNext = asArray(answer.readNext) as string[]

  const citations = (rawCitations ?? []).filter((c) => {
    if (!chunkIdSet.has(c.chunkId)) {
      invalidChunkIds.push(c.chunkId)
      return false
    }
    return true
  })
  const watchNext = rawWatchNext.filter((w) => {
    if (!videoIdSet.has(w.videoId)) {
      invalidVideoIds.push(w.videoId)
      return false
    }
    return true
  })
  const readNext = rawReadNext.filter((id) => {
    if (!chunkIdSet.has(id)) {
      invalidChunkIds.push(id)
      return false
    }
    return true
  })

  const cleaned: AnswerJson = {
    ...answer,
    citations,
    watchNext,
    readNext,
  }

  const total = asArray(answer.citations).length
  const validCites = citations.length
  const citationValidityPct = total === 0 ? 100 : Math.round((validCites / total) * 100)

  return {
    original: answer,
    cleaned,
    droppedCitations: asArray(answer.citations).length - citations.length,
    droppedWatchNext: asArray(answer.watchNext).length - watchNext.length,
    droppedReadNext: asArray(answer.readNext).length - readNext.length,
    invalidChunkIds,
    invalidVideoIds,
    citationValidityPct,
  }
}

/**
 * Coerce a value into an array. Some models return `watchNext: {}` or
 * `citations: null` when they mean "empty" — treat those as empty arrays
 * rather than crashing the validator.
 */
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}
