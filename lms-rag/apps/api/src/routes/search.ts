/**
 * POST /search — library-grounded search with an on-topic AI summariser.
 *
 * Flow:
 *   1. Hybrid retrieve (dense + keyword, rerank off for search speed).
 *   2. Group results as courses / modules / videos / library and format
 *      navigable URLs the LMS learner app understands.
 *   3. When submit=true (user hit Enter), the fast LLM gets the retrieved
 *      excerpts as context and produces a 2-3 sentence summary grounded on
 *      them — never a general-knowledge invention that contradicts the
 *      real cards. If the excerpts are empty, a server-side guard
 *      overwrites any invented answer with a standard "no direct match"
 *      sentence. Off-topic queries still return __OFF_TOPIC__ and surface
 *      as aiDeclined: true.
 *
 * Typing (submit=false) skips the LLM entirely — the four category lists
 * speak for themselves and cost ~150ms.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { hybridRetrieve } from '@ai-guru/core/retrieval'
import { withRetry, chatComplete, MODELS, substantiveChunks, type ContextChunk } from '@ai-guru/core/llm'
import { auth } from '@ai-guru/core'
import { requireLearner } from '../learner-auth.js'

const SearchBody = z.object({
  query: z.string().min(1).max(500),
  courseIds: z
    .array(z.union([z.number().int(), z.string().regex(/^\d+$/)]))
    .transform((arr) => arr.map((v) => (typeof v === 'number' ? v : Number(v))))
    .optional(),
  /** How many results to show per group. Default 5 each. */
  limit: z.number().int().min(1).max(20).optional(),
  /**
   * Two modes:
   *   submit=false (default) — instant library-only search for typing.
   *     Retrieval only, no LLM call. ~200ms cached, ~1s cold.
   *   submit=true — user pressed Enter. Always runs the AI (guardrailed)
   *     so ambiguous "the library returned something but does it answer?"
   *     always gets a direct AI response too.
   */
  submit: z.boolean().optional().default(false),
})

interface CourseHit {
  id: number
  title: string
  courseId: number
  url: string
  snippet?: string
}
interface ModuleHit {
  id: number
  title: string
  courseId: number
  courseTitle?: string
  url: string
  snippet?: string
}
interface VideoHit {
  videoId: number
  contentId?: number
  courseId: number
  courseTitle?: string
  moduleTitle?: string
  title: string
  url: string
  snippet: string
  startSec: number
}
interface LibraryHit {
  /** Synthetic stable id (hash of bookId:page or bookId:catalog). */
  id: number
  bookId: string
  bookTitle: string
  /** 0 for catalogue entries; 1..N for a specific book page. */
  apiPage: number
  totalPages: number
  category?: string
  subcategory?: string
  url: string
  snippet?: string
  /** True when this hit represents the whole book (catalogue entry) rather
   *  than a specific page. Frontend uses it to drop the "— Page N" suffix. */
  isCatalog?: boolean
}

const OFF_TOPIC_TOKEN = '__OFF_TOPIC__'
const STOPWORDS = new Set([
  'what', 'which', 'when', 'where', 'does', 'about', 'this', 'that', 'them',
  'they', 'have', 'from', 'with', 'your', 'like', 'much', 'many', 'some',
  'here', 'there', 'been', 'were', 'will', 'would', 'could', 'should',
  'tell', 'show', 'find', 'know', 'need', 'want', 'help', 'give', 'take',
])

const AI_SYSTEM = `You are a concise helper embedded in a Hindu temple training LMS search bar. The learner submitted a query. The library search returned the excerpts below (which may be empty).

How to answer:

1. If the supplied excerpts actually address the query, ground your answer in them:
   - Summarise what the library has, in your own words, in 2-3 short sentences.
   - Where helpful, name a specific book, video, course or module the learner can open (names come ONLY from the excerpts' sourceTitle lines; do NOT invent names).
   - Do NOT claim the library contains anything that isn't in the excerpts.

2. If the excerpts are empty or don't address the query, but the query is in scope for a Hindu temple training LMS (see scope list below):
   - Answer the question directly in 2-3 short sentences from general knowledge of Hindu temple life and seva.
   - DO NOT mention "the library" at all when doing this — don't say "the library doesn't cover…", don't say "the library suggests…", just answer.
   - DO NOT fabricate a specific book, video, course or module name — if you don't have it in the excerpts, don't mention a title.

3. If the query is CLEARLY off-topic — weather, coding, celebrities, politics, sports, general trivia, current affairs, product reviews, comparisons of other religions, consumer advice unrelated to temple life — respond with EXACTLY this token and nothing else:
${OFF_TOPIC_TOKEN}

Style: Short. Direct. No bullet lists. No greetings. No "I think" / "I believe". No disclaimers about being an AI.

In scope (illustrative, not exhaustive):
  * Temple operations, seva, sadhana, puja, arati, kirtan, prasadam, festivals, ashrama life
  * Guest reception, welcoming visitors, hospitality, darshan etiquette, community outreach
  * Deities (Krishna, Rama, Shiva, Devi) and their forms, pastimes, worship
  * Saints, acharyas, gurus (Chaitanya Mahaprabhu, Srila Prabhupada, Ramanuja, Madhva, etc.)
  * Scripture (Vedas, Upanishads, Puranas, Bhagavad Gita, Srimad Bhagavatam, Ramayana, Mahabharata)
  * Yogas and philosophies (bhakti, jnana, karma, ashtanga, sankhya, vedanta)
  * Sanskrit terms and their meanings
  * Home worship, personal sadhana, japa, chanting, deity care at home
  * Volunteer training, temple etiquette, dress code, service protocols
  * The LMS itself, its courses and how to use it`

/**
 * Compose the retrieval excerpts the AI gets in the user message. Mirrors
 * generate.ts's buildContext() but formatted for the short-answer search
 * surface: shorter snippets, source type tagged inline so the LLM can
 * naturally say "the Strategy & Planning book" or "the Your Role in
 * Visitor Reception video" when citing. Empty-context block is explicit so
 * the LLM can honor the "no direct match" rule rather than improvise.
 *
 * Only passes substantive excerpts (filters out 28-char video-cue
 * fragments that have no semantic content on their own).
 */
function buildSearchAIContext(
  chunks: ContextChunk[],
  query: string,
): { context: string; hasContent: boolean } {
  const good = substantiveChunks(chunks)
  if (good.length === 0) {
    // No library content hit this query. Still ask the model to answer
    // normally if the query is in scope — the prompt's rule #2 handles
    // this path. We deliberately do NOT tell the model "the library has
    // nothing" because that framing was baked into the old prompt and the
    // model kept leading with "the library doesn't cover this" even when
    // retrieval later surfaced real hits (false contradiction with the
    // cards above). Keep the context section empty and let the model
    // follow rule #2.
    return {
      context: `Library search excerpts for "${query}":\n\n(no matching excerpts)`,
      hasContent: false,
    }
  }
  const lines = good.map((c, i) => {
    const trail = c.headingTrail.length ? ` > ${c.headingTrail.join(' > ')}` : ''
    const snippet = (c.text ?? '').replace(/\s+/g, ' ').slice(0, 360).trim()
    return `[${i + 1}] ${c.sourceTitle}${trail}\n${snippet}`
  })
  return {
    context: `Library search excerpts for "${query}":\n\n${lines.join('\n\n')}`,
    hasContent: true,
  }
}

export async function searchRoute(app: FastifyInstance) {
  app.post('/search', async (req, reply) => {
    const body = SearchBody.parse(req.body)
    const limit = body.limit ?? 5

    // Reuse the same auth surface as /ask so tenant + course scoping stay
    // consistent. Unauthenticated mode is fine in dev — the widget still
    // gets scoped results via the courseIds it sends.
    let identity: auth.LearnerIdentity
    try {
      identity = requireLearner(req, body.courseIds)
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode ?? 500
      return reply.code(code).send({ error: (err as Error).message })
    }
    const effectiveCourseIds = auth.authEnabled()
      ? identity.courseIds
      : body.courseIds ?? identity.courseIds

    const retrieval = await hybridRetrieve(body.query, {
      tenantId: identity.tenantId,
      courseIds: effectiveCourseIds.length > 0 ? effectiveCourseIds : undefined,
      useKeyword: true,
      useRerank: false, // rerank is a chat concern; skip for search speed
      skipRewrite: true, // search queries are short + explicit; skip the 2-5s LLM rewrite
      // Try the dense (semantic) lane but cap it at 5s. If Gemini hangs or
      // errors, retrieval transparently falls back to keyword-only so the
      // search bar always responds quickly. Chat/voice use the full hybrid
      // without the cap because they can afford the latency.
      embedTimeoutMs: 5000,
    })

    const courses = new Map<number, CourseHit>()
    const modules = new Map<number, ModuleHit>()
    const videos = new Map<number, VideoHit>()
    const library = new Map<number, LibraryHit>()

    // Chunks → derive course / module / video / library hits from sourceId patterns.
    for (const c of retrieval.chunks) {
      const cid = c.courseId
      const src = c.sourceId ?? c.id
      // Reading-library chunks are cross-course and intentionally have a NULL
      // courseId. Handle them BEFORE the courseId guard that filters out
      // course/module/video chunks missing a scope.
      //
      // Catalogue entries (one chunk per book, summarising title + category +
      // topics) match searches like "governance" or "books about kitchen" even
      // when no page body contains the keyword verbatim.
      const mBookCatalog = /^book:([a-f0-9-]+):catalog$/i.exec(src)
      if (mBookCatalog && c.sourceKind === 'library') {
        const bookId = mBookCatalog[1]!
        const meta = (c.sourceMetadata ?? {}) as {
          bookTitle?: string
          category?: string
          subcategory?: string
          readerUrl?: string
        }
        const virtualId = Math.abs(hashString(`${bookId}:catalog`))
        if (!library.has(virtualId)) {
          library.set(virtualId, {
            id: virtualId,
            bookId,
            bookTitle: meta.bookTitle ?? c.sourceTitle,
            apiPage: 0,
            totalPages: 1,
            category: meta.category,
            subcategory: meta.subcategory,
            url: meta.readerUrl ?? `/reading-library/${bookId}`,
            snippet: (c.text ?? '').slice(0, 140),
            isCatalog: true,
          })
        }
        continue
      }
      const mBook = /^book:([a-f0-9-]+):page:(\d+)$/i.exec(src)
      if (mBook && c.sourceKind === 'library') {
        const bookId = mBook[1]!
        const apiPage = Number(mBook[2])
        const meta = (c.sourceMetadata ?? {}) as {
          bookTitle?: string
          authorName?: string
          category?: string
          subcategory?: string
          totalPages?: number
          readerUrl?: string
        }
        const key = `${bookId}:${apiPage}`
        const virtualId = Math.abs(hashString(key))
        if (!library.has(virtualId)) {
          const baseUrl = meta.readerUrl ?? `/reading-library/${bookId}?page=${apiPage}`
          // Append the user's query so the reader can scroll to and highlight
          // the matching text on the destination page. Reader is tolerant of
          // the extra param when no match is found.
          const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}q=${encodeURIComponent(body.query)}`
          library.set(virtualId, {
            id: virtualId,
            bookId,
            bookTitle: meta.bookTitle ?? c.sourceTitle,
            apiPage,
            totalPages: meta.totalPages ?? 1,
            category: meta.category,
            subcategory: meta.subcategory,
            url,
            snippet: (c.text ?? '').slice(0, 140),
          })
        }
        continue
      }
      if (cid == null) continue
      // `course:${id}` ingest source
      const mCourse = /^course:(\d+)$/.exec(src)
      if (mCourse) {
        const id = Number(mCourse[1])
        if (!courses.has(id)) {
          courses.set(id, {
            id,
            title: c.sourceTitle,
            courseId: cid,
            url: `/learn/${cid}`,
            snippet: c.text?.slice(0, 140),
          })
        }
        continue
      }
      // `module:${id}` ingest source
      const mMod = /^module:(\d+)$/.exec(src)
      if (mMod) {
        const id = Number(mMod[1])
        if (!modules.has(id)) {
          modules.set(id, {
            id,
            title: c.sourceTitle,
            courseId: cid,
            courseTitle: c.courseTitle,
            url: `/learn/${cid}?s=${id}`,
            snippet: c.text?.slice(0, 140),
          })
        }
        continue
      }
      // `video:${videoId}:content:${contentId}` ingest source
      const mVid = /^video:(\d+):content:(\d+)/.exec(src)
      if (mVid) {
        const vid = Number(mVid[1])
        const contentId = Number(mVid[2])
        if (!videos.has(vid)) {
          videos.set(vid, {
            videoId: vid,
            contentId,
            courseId: cid,
            courseTitle: c.courseTitle,
            moduleTitle: c.moduleTitle,
            title: c.sourceTitle,
            url: `/learn/${cid}?s=${contentId}`,
            snippet: (c.text ?? '').slice(0, 140),
            startSec: 0,
          })
        }
        continue
      }
      // (reading-library case handled above the courseId guard — see top of loop)
    }

    // Video cues also count as video hits — richer snippets from the actual
    // transcript. Prefer cue-derived over chunk-derived when both exist.
    for (const v of retrieval.videoCues) {
      const existing = videos.get(v.videoId)
      const snippet = v.text?.slice(0, 140) ?? existing?.snippet ?? ''
      videos.set(v.videoId, {
        videoId: v.videoId,
        contentId: v.contentId ?? existing?.contentId,
        courseId: v.courseId ?? existing?.courseId ?? 0,
        courseTitle: v.courseTitle ?? existing?.courseTitle,
        moduleTitle: v.moduleTitle ?? existing?.moduleTitle,
        title: v.videoTitle ?? existing?.title ?? `Video ${v.videoId}`,
        url:
          v.courseId && v.contentId
            ? `/learn/${v.courseId}?s=${v.contentId}`
            : existing?.url ?? '#',
        snippet,
        startSec: v.startSec ?? 0,
      })
    }

    const coursesArr = [...courses.values()].slice(0, limit)
    const modulesArr = [...modules.values()].slice(0, limit)
    const videosArr = [...videos.values()].slice(0, limit)
    const libraryArr = [...library.values()].slice(0, limit)

    // Relevance signal: RRF alone is non-discriminative (always ~0.016 for
    // top-1 in one lane). Instead check if any meaningful word from the query
    // literally appears in the top result's text or title — cheap, honest,
    // catches "retrieval returned something but nothing actually matched".
    const queryWords = body.query
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[^a-z0-9]/g, ''))
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
    // Only match on TITLES (course / module / video), not body text or
    // transcript fragments. Titles are curated + specific, so a title match
    // is real topical relevance. Body matches trigger false positives when a
    // stray word ("india", "temple") happens to appear in a transcript.
    const haystack = [
      ...coursesArr.map((c) => c.title),
      ...modulesArr.map((m) => `${m.title} ${m.courseTitle ?? ''}`),
      ...videosArr.map((v) => `${v.title} ${v.courseTitle ?? ''} ${v.moduleTitle ?? ''}`),
      ...libraryArr.map((b) => `${b.bookTitle} ${b.category ?? ''} ${b.subcategory ?? ''}`),
    ]
      .join(' ')
      .toLowerCase()
    // If the query has no scoreable words (short greeting etc.), fall back
    // to "library returned anything" as the relevance signal.
    const hasStrong =
      queryWords.length === 0
        ? coursesArr.length + modulesArr.length + videosArr.length + libraryArr.length > 0
        : queryWords.some((w) => haystack.includes(w))
    req.log.info(
      { queryWords, hasStrong, haystackLen: haystack.length },
      'search relevance',
    )

    // AI fires only on explicit submit (Enter). Typing = library-only for
    // speed. When submit=true, run the guardrailed AI regardless of how
    // strong the library match seems — user is asking for a direct answer,
    // not a list of related items.
    let aiAnswer: string | undefined
    let aiDeclined = false

    if (body.submit) {
      // Build the context the LLM will ground on. Mirrors /ask + /ask/sync's
      // contract so a library-covered query gets a summarising answer, not
      // a training-data invention that contradicts the real cards above.
      const aiChunks: ContextChunk[] = retrieval.chunks.map((c, i) => ({
        id: `k${i + 1}`,
        chunkId: c.id,
        headingTrail: c.headingTrail,
        sourceTitle: c.sourceTitle,
        text: c.text,
      }))
      const aiCues: ContextChunk[] = retrieval.videoCues.slice(0, 3).map((v, i) => ({
        id: `v${i + 1}`,
        chunkId: v.id,
        headingTrail: [v.videoTitle ?? `video ${v.videoId}`],
        sourceTitle: `Video cue @${v.startSec}s`,
        text: v.text,
        videoId: v.videoId,
        startSec: v.startSec,
      }))
      const { context } = buildSearchAIContext([...aiChunks, ...aiCues], body.query)
      try {
        const res = await withRetry(
          () =>
            chatComplete({
              model: MODELS.fast,
              messages: [
                { role: 'system', content: AI_SYSTEM },
                { role: 'user', content: context },
              ],
              temperature: 0.2,
            }),
          { attempts: 2 },
        )
        const text = (res.text ?? '').trim()
        if (text === OFF_TOPIC_TOKEN || text.startsWith(OFF_TOPIC_TOKEN)) {
          aiDeclined = true
        } else if (text.length > 0) {
          aiAnswer = text
        }
        // No hard honesty override here. For in-scope queries with empty
        // excerpts, the prompt's rule #2 permits (and encourages) a short
        // general-knowledge answer that does NOT claim library coverage —
        // which is what the learner asked for ("answer temple questions,
        // not just library-grounded ones"). Off-topic queries are still
        // handled by the OFF_TOPIC_TOKEN mechanism above. If prompt leakage
        // starts producing false library claims on empty-excerpt queries,
        // reintroduce a targeted guard that only fires when the answer
        // literally mentions the word "library".
      } catch (err) {
        req.log.warn({ err }, 'search AI fallback failed')
      }
    }

    return reply.send({
      query: body.query,
      results: {
        courses: coursesArr,
        modules: modulesArr,
        videos: videosArr,
        library: libraryArr,
      },
      hasStrongMatches: hasStrong,
      aiAnswer,
      aiDeclined,
    })
  })
}

/** FNV-1a 32-bit hash, used to synthesize a stable integer id for library
 *  book-page hits so they can share the modules[] Map (which is keyed by
 *  integer). Real lms-service module ids are small positive integers; the
 *  signed-int wraparound here puts synthetic ids far from that range so
 *  collisions are vanishingly unlikely. */
function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h | 0
}
