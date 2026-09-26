import { embedOne } from '../embeddings/gemini.js'
import { rewriteAndHyde, type ConversationTurn } from '../llm/rewrite.js'
import { llmRerank, type RerankCandidate } from '../llm/rerank.js'
import {
  keywordSearchChunks,
  keywordSearchVideoCues,
  type KeywordHit,
} from './keyword.js'
import {
  vectorSearchChunks,
  vectorSearchVideoCues,
  type VectorHit,
  type VideoCueHit,
} from './vector.js'

export interface FusedChunk {
  id: string
  sourceId: string
  sourceTitle: string
  headingTrail: string[]
  text: string
  rrfScore: number
  vectorRank?: number
  keywordRank?: number
  courseId?: number
  courseTitle?: string
  moduleId?: number
  moduleTitle?: string
}

export interface FusedVideoCue {
  id: string
  videoId: number
  videoTitle: string
  playbackUrl?: string
  cueId: string
  startSec: number
  endSec: number
  text: string
  rrfScore: number
  vectorRank?: number
  keywordRank?: number
  courseId?: number
  courseTitle?: string
  moduleId?: number
  moduleTitle?: string
  /** parent contents.id — used to deep-link into the learner app */
  contentId?: number
}

export interface HybridRetrievalResult {
  query: string
  rewritten: string
  hyde: string
  chunks: FusedChunk[]
  videoCues: FusedVideoCue[]
  /** true if the top rerank score suggests we should escalate to strong model */
  lowConfidence: boolean
}

export interface HybridRetrievalOptions {
  /** candidates from each lane (dense + keyword) before fusion */
  perLaneK?: number
  /** post-fusion pool passed to reranker */
  rerankPoolK?: number
  /** final K after rerank */
  finalK?: number
  /** if false, skip keyword lane — dense-only mode for smoke tests */
  useKeyword?: boolean
  /** if false, skip LLM rerank — used to A/B against no-rerank baseline */
  useRerank?: boolean
  /**
   * Tenant scope. Every query filters by (tenant_id, course_id) so no
   * cross-tenant leakage is possible. Undefined = search across all
   * tenants (dev/POC only — MUST be set in production).
   */
  tenantId?: string
  /**
   * Course scope. Retrieval limited to chunks/cues in these courses. Callers
   * should pass the learner's enrolled course ids (integers, matching
   * lms-service `courses.id`). Undefined = search everything (dev/POC only).
   */
  courseIds?: number[]
  /**
   * Prior conversation turns (user/assistant messages) for reference resolution.
   * Rewrite step uses these to turn "how does the first one work?" into
   * "how does the Banking sub-department of Treasury work?".
   */
  history?: ConversationTurn[]
  /**
   * Skip the LLM-based query rewrite + HyDE step. Useful for latency-critical
   * paths (like an instant search bar) where the raw query is short and
   * specific enough not to need reference resolution. Saves 2-5s per call.
   */
  skipRewrite?: boolean
}

/**
 * Hybrid retrieval: dense (Gemini + HyDE) + keyword (Postgres FTS), fused
 * with Reciprocal Rank Fusion, then LLM-reranked. This is the shape the plan
 * §6 says to build; the useKeyword/useRerank flags exist so the eval harness
 * can A/B against no-rerank and dense-only baselines.
 */
export async function hybridRetrieve(
  query: string,
  opts: HybridRetrievalOptions = {},
): Promise<HybridRetrievalResult> {
  // Retrieval sizing: retrieve BROAD, pass FEW.
  //   perLaneK    = candidates per lane (dense, keyword). Broader = better recall.
  //   rerankPoolK = fused pool after RRF (input to optional reranker).
  //   finalK      = chunks passed to the answer model (drives prefill token cost).
  // Tighter finalK cuts input tokens ~40% at scale without hurting answer quality,
  // and reduces "lost in the middle" attention issues on long contexts.
  const perLaneK = opts.perLaneK ?? 50
  const rerankPoolK = opts.rerankPoolK ?? 50
  const finalK = opts.finalK ?? 6
  const useKeyword = opts.useKeyword ?? true
  const useRerank = opts.useRerank ?? true

  const { rewritten, hyde } = opts.skipRewrite
    ? { rewritten: query, hyde: query }
    : await rewriteAndHyde(query, opts.history)

  // HyDE embedding is what dense lane uses — a plausible hypothetical answer
  // pulls the right region of the space even when the raw question is thin.
  const [queryVec] = await Promise.all([embedOne(hyde, 'RETRIEVAL_QUERY')])

  // Run all four retrieval queries concurrently — text + video, dense + keyword.
  // Two small searches on the two separately-indexed tables (chunks, video_cues)
  // beat one large scan; issuing them together means the round-trip is bounded
  // by the slowest of the four, not the sum.
  const [denseChunks, kwChunks, denseCues, kwCues] = await Promise.all([
    vectorSearchChunks(queryVec, perLaneK, opts.courseIds, opts.tenantId),
    useKeyword
      ? keywordSearchChunks(rewritten, perLaneK, opts.courseIds, opts.tenantId)
      : Promise.resolve([] as KeywordHit[]),
    vectorSearchVideoCues(queryVec, perLaneK, opts.courseIds, opts.tenantId),
    useKeyword
      ? keywordSearchVideoCues(rewritten, perLaneK, opts.courseIds, opts.tenantId)
      : Promise.resolve([] as KeywordHit[]),
  ])

  const fusedChunks = rrfChunks(denseChunks, kwChunks, rerankPoolK)
  const fusedCues = rrfCues(denseCues, kwCues, rerankPoolK)

  let finalChunks = fusedChunks.slice(0, finalK)
  let lowConfidence = false

  if (useRerank && fusedChunks.length > 1) {
    const candidates: RerankCandidate[] = fusedChunks.map((c) => ({
      id: c.id,
      headingTrail: c.headingTrail,
      rawText: c.text,
    }))
    const reranked = await llmRerank(rewritten, candidates, { topK: finalK })
    const byId = new Map(fusedChunks.map((c) => [c.id, c]))
    finalChunks = reranked.map((r) => byId.get(r.id)!).filter(Boolean)

    // Escalation is expensive (Pro model is ~5x slower than Flash). Only
    // trigger when retrieval is genuinely thin — not just "not a bullseye".
    // Two-of-two rule: escalate ONLY when
    //   (a) fewer than 3 chunks made it through rerank, AND
    //   (b) the top RRF score is below the hard floor (0.008).
    // Rationale: if the reranker returned 10 chunks even with low scores,
    // Flash has plenty to synthesize from. A high-score top-1 also means the
    // pool is fine even if there aren't many candidates. Only "few AND weak"
    // deserves the escalation tax.
    const LOW_CONF_SCORE = Number(process.env.LOW_CONFIDENCE_RRF_FLOOR ?? '0.008')
    const LOW_CONF_MIN_CHUNKS = Number(process.env.LOW_CONFIDENCE_MIN_CHUNKS ?? '3')
    lowConfidence =
      finalChunks.length < LOW_CONF_MIN_CHUNKS &&
      (finalChunks[0]?.rrfScore ?? 0) < LOW_CONF_SCORE
  }

  // Per-video dedupe: keep at most MAX_CUES_PER_VIDEO cues from any one
  // video (avoids one video hogging the recommendation list) and cap the
  // total number of distinct videos at MAX_VIDEOS. Applied AFTER RRF so we
  // still let both lanes vote on which cues are best. Env-tunable for eval.
  const MAX_CUES_PER_VIDEO = Number(process.env.MAX_CUES_PER_VIDEO ?? '3')
  const MAX_VIDEOS = Number(process.env.MAX_VIDEOS ?? '5')
  const dedupedCues = dedupeCuesPerVideo(fusedCues, MAX_CUES_PER_VIDEO, MAX_VIDEOS)

  return {
    query,
    rewritten,
    hyde,
    chunks: finalChunks,
    videoCues: dedupedCues.slice(0, finalK),
    lowConfidence,
  }
}

/**
 * Per-video dedupe. Walks cues in already-ranked order, keeping up to
 * `maxPerVideo` cues from each unique videoId until we've hit `maxVideos`.
 * Order preserved so the top-ranked cue for each video wins the slot.
 */
function dedupeCuesPerVideo(
  cues: FusedVideoCue[],
  maxPerVideo: number,
  maxVideos: number,
): FusedVideoCue[] {
  const perVideoCount = new Map<number, number>()
  const out: FusedVideoCue[] = []
  for (const c of cues) {
    const seenCount = perVideoCount.get(c.videoId) ?? 0
    // Skip: this video already reached the per-video cap.
    if (seenCount >= maxPerVideo) continue
    // Skip: we've already accepted maxVideos distinct videos and this isn't one of them.
    if (seenCount === 0 && perVideoCount.size >= maxVideos) continue
    perVideoCount.set(c.videoId, seenCount + 1)
    out.push(c)
  }
  return out
}

// --- Reciprocal Rank Fusion -------------------------------------------------
// RRF: score(d) = Σ 1 / (k + rank_i(d))  — k=60 is the canonical constant.

const RRF_K = 60

function rrfChunks(dense: VectorHit[], keyword: KeywordHit[], limit: number): FusedChunk[] {
  const denseRank = rankMap(dense.map((d) => d.id))
  const kwRank = rankMap(keyword.map((k) => k.id))
  const combined = new Map<string, FusedChunk>()

  for (const d of dense) {
    const rank = denseRank.get(d.id)!
    combined.set(d.id, {
      id: d.id,
      sourceId: d.sourceId,
      sourceTitle: d.sourceTitle,
      headingTrail: d.headingTrail,
      text: d.text,
      rrfScore: 1 / (RRF_K + rank),
      vectorRank: rank,
      courseId: d.courseId,
      courseTitle: d.courseTitle,
      moduleId: d.moduleId,
      moduleTitle: d.moduleTitle,
    })
  }
  for (const k of keyword) {
    const rank = kwRank.get(k.id)!
    const existing = combined.get(k.id)
    if (existing) {
      existing.rrfScore += 1 / (RRF_K + rank)
      existing.keywordRank = rank
    } else {
      combined.set(k.id, {
        id: k.id,
        sourceId: k.sourceId ?? '',
        sourceTitle: k.sourceTitle ?? '',
        headingTrail: k.headingTrail ?? [],
        text: k.text,
        rrfScore: 1 / (RRF_K + rank),
        keywordRank: rank,
      })
    }
  }

  return [...combined.values()].sort((a, b) => b.rrfScore - a.rrfScore).slice(0, limit)
}

function rrfCues(dense: VideoCueHit[], keyword: KeywordHit[], limit: number): FusedVideoCue[] {
  const denseRank = rankMap(dense.map((d) => d.id))
  const kwRank = rankMap(keyword.map((k) => k.id))
  const combined = new Map<string, FusedVideoCue>()

  for (const d of dense) {
    const rank = denseRank.get(d.id)!
    combined.set(d.id, {
      id: d.id,
      videoId: d.videoId,
      videoTitle: d.videoTitle,
      playbackUrl: d.playbackUrl,
      cueId: d.cueId,
      startSec: d.startSec,
      endSec: d.endSec,
      text: d.text,
      rrfScore: 1 / (RRF_K + rank),
      vectorRank: rank,
      courseId: d.courseId,
      courseTitle: d.courseTitle,
      moduleId: d.moduleId,
      moduleTitle: d.moduleTitle,
      contentId: d.contentId,
    })
  }
  for (const k of keyword) {
    const rank = kwRank.get(k.id)!
    const existing = combined.get(k.id)
    if (existing) {
      existing.rrfScore += 1 / (RRF_K + rank)
      existing.keywordRank = rank
    } else if (k.videoId != null) {
      combined.set(k.id, {
        id: k.id,
        videoId: k.videoId,
        // Keyword hits don't join sources; leave title/url empty. Retrieval
        // events prefer dense hits (which do have them) via RRF ordering.
        videoTitle: String(k.videoId),
        cueId: k.id.split('#')[1] ?? k.id,
        startSec: k.startSec ?? 0,
        endSec: k.endSec ?? 0,
        text: k.text,
        rrfScore: 1 / (RRF_K + rank),
        keywordRank: rank,
      })
    }
  }

  return [...combined.values()].sort((a, b) => b.rrfScore - a.rrfScore).slice(0, limit)
}

function rankMap(ids: string[]): Map<string, number> {
  const m = new Map<string, number>()
  ids.forEach((id, i) => m.set(id, i + 1))
  return m
}
