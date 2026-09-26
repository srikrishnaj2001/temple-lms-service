import { ask, type AskOptions } from '../ask.js'
import type { GoldenItem, GoldenSet } from './golden.js'
import {
  aggregate,
  passesGates,
  scoreQuestion,
  type AggregateMetrics,
  type PerQuestionMetrics,
} from './metrics.js'

export interface RunConfig {
  name: string
  options: AskOptions
}

export interface EvalRun {
  config: RunConfig
  perQuestion: PerQuestionMetrics[]
  aggregate: AggregateMetrics
  gates: ReturnType<typeof passesGates>
}

export interface EvalRunResult {
  runs: EvalRun[]
}

/**
 * Run every config against every golden question, sequentially so we don't
 * DoS the free-tier per-minute rate limit. If you want parallelism, add a
 * concurrency knob here — but the eval cache in `eval/cache.ts` means the
 * expensive path only runs once per (config, question) anyway.
 */
export async function runEval(golden: GoldenSet, configs: RunConfig[]): Promise<EvalRunResult> {
  const runs: EvalRun[] = []
  for (const config of configs) {
    const perQuestion: PerQuestionMetrics[] = []
    for (const item of golden) {
      const t0 = Date.now()
      try {
        const result = await ask(item.question, config.options)
        perQuestion.push(scoreQuestion(item, result, Date.now() - t0))
      } catch (err) {
        // record a synthetic failure row so the aggregate still reports N and
        // low-confidence configs don't silently drop questions.
        perQuestion.push(errorRow(item, err, Date.now() - t0))
      }
    }
    const agg = aggregate(perQuestion)
    runs.push({ config, perQuestion, aggregate: agg, gates: passesGates(agg) })
  }
  return { runs }
}

function errorRow(item: GoldenItem, err: unknown, latencyMs: number): PerQuestionMetrics {
  return {
    id: item.id,
    question: item.question,
    recallAt10: false,
    videoHitAt3: false,
    citationValidityPct: 0,
    escalated: false,
    latencyMs,
    retrievedChunkIds: [],
    goldChunkIds: item.goldChunkIds,
    missingChunkIds: item.goldChunkIds,
  }
}

/**
 * The three-way comparison from §8 (Day 9): rerank on vs no-rerank vs
 * dense-only. Keep the reranker only if the delta earns the latency.
 */
export function defaultRunConfigs(): RunConfig[] {
  return [
    { name: 'dense_only', options: { useKeyword: false, useRerank: false } },
    { name: 'hybrid_no_rerank', options: { useKeyword: true, useRerank: false } },
    { name: 'hybrid_llm_rerank', options: { useKeyword: true, useRerank: true } },
  ]
}
