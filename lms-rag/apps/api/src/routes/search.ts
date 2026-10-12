/**
 * POST /search — instant library search with an on-topic AI fallback.
 *
 * Flow:
 *   1. Hybrid retrieve (dense + keyword + rerank).
 *   2. Group results as courses / modules / videos and format navigable
 *      URLs the LMS learner app understands.
 *   3. If the top library result is weak (RRF score below floor), ask the
 *      fast LLM for a 2-3 sentence answer WITH a hard topic guardrail:
 *      the model must reply with the literal token `__OFF_TOPIC__` when the
 *      query is unrelated to temple training / seva / devotional practice.
 *      That token is intercepted server-side and surfaced as
 *      `aiDeclined: true` — the widget shows a friendly decline instead of
 *      the model's own decline phrasing.
 *
 * No LLM call at all when the library already has a good match — most
 * queries take ~150ms, no external cost. Off-topic queries cost one cheap
 * fast-model call (~$0.0001).
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { hybridRetrieve } from '@ai-guru/core/retrieval'
import { withRetry, chatComplete, MODELS } from '@ai-guru/core/llm'
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

const AI_SYSTEM = `You are a concise helper embedded in a Hindu temple training LMS search bar. The learner searched for something not covered by the library.

Rules:
- Answer in 2-3 short sentences. No bullet lists. No greetings.
- DEFAULT to answering. Only decline when the question is CLEARLY unrelated to Hindu religion, temple life, or a temple volunteer's work.
- Explicitly IN scope (this list is illustrative, not exhaustive):
  * Temple operations, seva, sadhana, puja, arati, kirtan, prasadam, festivals, ashrama life
  * Guest reception, welcoming first-time visitors, hospitality, darshan etiquette, community outreach, devotee care
  * Deities (Krishna, Rama, Shiva, Devi, and their forms/pastimes)
  * Saints, acharyas, gurus (Chaitanya Mahaprabhu, Srila Prabhupada, Rupa Goswami, Ramanuja, Madhva, etc.)
  * Scripture: Vedas, Upanishads, Puranas, Bhagavad Gita, Srimad Bhagavatam, Ramayana, Mahabharata
  * Yogas and philosophies: bhakti, jnana, karma, ashtanga; sankhya, vedanta
  * Sanskrit terms and their meanings
  * Home worship, personal sadhana, japa, chanting, deity care at home
  * Volunteer training, temple etiquette, dress code, service protocols
  * The LMS itself and its courses
- ONLY decline for clearly off-topic requests: weather, coding, celebrities, politics, sports, general trivia, current affairs, product reviews, comparisons of other religions. In that case respond with EXACTLY this token and nothing else:
${OFF_TOPIC_TOKEN}
- Never invent LMS course names or claim the library contains something. This is a fallback for when the library does NOT cover the topic.`

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
      try {
        const res = await withRetry(
          () =>
            chatComplete({
              model: MODELS.fast,
              messages: [
                { role: 'system', content: AI_SYSTEM },
                { role: 'user', content: body.query },
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
