import type { AskResult } from '../ask.js'
import type { GoldenItem } from './golden.js'

export interface PerQuestionMetrics {
  id: string
  question: string
  recallAt10: boolean
  videoHitAt3: boolean
  citationValidityPct: number
  escalated: boolean
  latencyMs: number
  retrievedChunkIds: string[]
  goldChunkIds: string[]
  missingChunkIds: string[]
}

export interface AggregateMetrics {
  n: number
  recallAt10: number
  videoHitAt3: number
  citationValidity100Rate: number
  meanCitationValidity: number
  escalationRate: number
  meanLatencyMs: number
  p95LatencyMs: number
}

export function scoreQuestion(item: GoldenItem, result: AskResult, latencyMs: number): PerQuestionMetrics {
  const retrievedChunkIds = result.retrieval.chunks.map((c) => c.chunkId)
  const top10 = new Set(retrievedChunkIds.slice(0, 10))
  const goldSet = new Set(item.goldChunkIds)
  const recallAt10 = item.goldChunkIds.length === 0 || item.goldChunkIds.some((g) => top10.has(g))

  const top3Videos = new Set(
    (result.answer.watchNext ?? []).slice(0, 3).map((w) => w.videoId),
  )
  const videoHitAt3 =
    item.goldVideoIds.length === 0 || item.goldVideoIds.some((v) => top3Videos.has(v))

  return {
    id: item.id,
    question: item.question,
    recallAt10,
    videoHitAt3,
    citationValidityPct: result.validation.citationValidityPct,
    escalated: result.escalated,
    latencyMs,
    retrievedChunkIds,
    goldChunkIds: item.goldChunkIds,
    missingChunkIds: item.goldChunkIds.filter((g) => !goldSet.has(g) ? false : !top10.has(g)),
  }
}

export function aggregate(rows: PerQuestionMetrics[]): AggregateMetrics {
  const n = rows.length
  if (n === 0) {
    return {
      n: 0,
      recallAt10: 0,
      videoHitAt3: 0,
      citationValidity100Rate: 0,
      meanCitationValidity: 0,
      escalationRate: 0,
      meanLatencyMs: 0,
      p95LatencyMs: 0,
    }
  }
  const recall = rows.filter((r) => r.recallAt10).length / n
  const video = rows.filter((r) => r.videoHitAt3).length / n
  const cv100 = rows.filter((r) => r.citationValidityPct === 100).length / n
  const meanCv = rows.reduce((s, r) => s + r.citationValidityPct, 0) / n
  const esc = rows.filter((r) => r.escalated).length / n
  const meanLat = rows.reduce((s, r) => s + r.latencyMs, 0) / n
  const sortedLat = [...rows.map((r) => r.latencyMs)].sort((a, b) => a - b)
  const p95Idx = Math.max(0, Math.floor(0.95 * (sortedLat.length - 1)))
  const p95Lat = sortedLat[p95Idx] ?? 0
  return {
    n,
    recallAt10: round(recall, 3),
    videoHitAt3: round(video, 3),
    citationValidity100Rate: round(cv100, 3),
    meanCitationValidity: round(meanCv, 1),
    escalationRate: round(esc, 3),
    meanLatencyMs: Math.round(meanLat),
    p95LatencyMs: p95Lat,
  }
}

/**
 * Gate criteria from §8 of the Gemini plan — reverted to the originals in
 * ai-guru-poc-plan.md §7 because the model is now production-representative.
 */
export const GATE_TARGETS = {
  recallAt10: 0.85,
  videoHitAt3: 0.8,
  citationValidity: 1.0,
} as const

export function passesGates(agg: AggregateMetrics) {
  return {
    recallAt10: agg.recallAt10 >= GATE_TARGETS.recallAt10,
    videoHitAt3: agg.videoHitAt3 >= GATE_TARGETS.videoHitAt3,
    citationValidity: agg.citationValidity100Rate >= GATE_TARGETS.citationValidity,
  }
}

function round(x: number, d: number) {
  const m = 10 ** d
  return Math.round(x * m) / m
}
