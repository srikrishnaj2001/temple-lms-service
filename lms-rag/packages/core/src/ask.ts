import { generateAnswer, type ContextChunk } from './llm/generate.js'
import { hybridRetrieve, type HybridRetrievalOptions } from './retrieval/hybrid.js'
import { validateAnswer, type ValidationReport } from './validation/citations.js'

export interface AskOptions extends HybridRetrievalOptions {
  /** if true, escalate to strong model on low-confidence retrieval */
  escalateOnLowConfidence?: boolean
}

/**
 * Build the courseIds list the retrieval layer should see for a user.
 * Returns the input verbatim; the old `'global'` sentinel is gone (courses
 * are now integers owned by lms-service, and there is no cross-course pool).
 * Kept as a passthrough helper for callers that used to rely on the wrapping
 * so we don't churn every call site at once.
 */
export function scopedCourseIds(userCourseIds: number[] | undefined): number[] | undefined {
  return userCourseIds
}

export interface AskResult {
  query: string
  rewritten: string
  hyde: string
  retrieval: {
    chunks: ContextChunk[]
    videoCues: ReturnType<typeof hybridRetrieve> extends Promise<infer T>
      ? T extends { videoCues: infer V }
        ? V
        : never
      : never
  }
  answer: ValidationReport['cleaned']
  validation: ValidationReport
  escalated: boolean
}

/**
 * End-to-end ask: rewrite → hybrid retrieve → rerank → generate → validate.
 * This is what the API and the eval harness both call — one code path so
 * eval numbers reflect what the API actually does.
 */
export async function ask(query: string, opts: AskOptions = {}): Promise<AskResult> {
  const retrieval = await hybridRetrieve(query, opts)
  const contextChunks: ContextChunk[] = retrieval.chunks.map((c, i) => ({
    id: `k${i + 1}`,
    chunkId: c.id,
    headingTrail: c.headingTrail,
    sourceTitle: c.sourceTitle,
    text: c.text,
  }))

  // Feed the top 1–2 video cues to the LLM as context so it CAN recommend a
  // video if the question warrants it. The tightened prompt (see generate.ts)
  // decides whether to actually surface watchNext — cross-pool RRF-score
  // comparison doesn't work here because text-chunk and video-cue pools
  // produce different score scales. The one hard filter: cues must clear an
  // absolute-score floor so obvious non-matches get dropped.
  //
  // Env tuning:
  //   VIDEO_INCLUDE_MAX_CUES     max cues sent to LLM (default 2)
  //   VIDEO_MIN_ABSOLUTE_SCORE   floor on rrfScore (default 0.008 — matches
  //                              a rank ~60 in either lane, roughly "at least
  //                              one lane found something related")
  const VIDEO_INCLUDE_MAX_CUES = Number(process.env.VIDEO_INCLUDE_MAX_CUES ?? '2')
  const VIDEO_MIN_ABSOLUTE_SCORE = Number(process.env.VIDEO_MIN_ABSOLUTE_SCORE ?? '0.008')
  const qualifyingCues = retrieval.videoCues
    .filter((v) => v.rrfScore >= VIDEO_MIN_ABSOLUTE_SCORE)
    .slice(0, VIDEO_INCLUDE_MAX_CUES)
  const cueContext: ContextChunk[] = qualifyingCues.map((v, i) => ({
    id: `v${i + 1}`,
    chunkId: v.id,
    headingTrail: [`video ${v.videoId}`],
    sourceTitle: `Video cue @${v.startSec}s`,
    text: v.text,
    videoId: v.videoId,
    startSec: v.startSec,
  }))

  const escalate = (opts.escalateOnLowConfidence ?? true) && retrieval.lowConfidence
  const answer = await generateAnswer(query, [...contextChunks, ...cueContext], { escalate })
  const validation = validateAnswer(answer, [...contextChunks, ...cueContext], retrieval.videoCues)

  return {
    query,
    rewritten: retrieval.rewritten,
    hyde: retrieval.hyde,
    retrieval: {
      chunks: contextChunks,
      videoCues: retrieval.videoCues as never,
    },
    answer: validation.cleaned,
    validation,
    escalated: escalate,
  }
}
