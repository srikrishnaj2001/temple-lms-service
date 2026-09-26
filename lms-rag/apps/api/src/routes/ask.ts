import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { hybridRetrieve } from '@ai-guru/core/retrieval'
import { streamAnswer, type ContextChunk } from '@ai-guru/core/llm'
import { validation, auth, conversations } from '@ai-guru/core'
import { createSession, deleteSession, getSession } from '../sse/session.js'
import { cacheKey, getCached, putCached, type CachedResponse } from '../sse/answer-cache.js'
import { requireLearner } from '../learner-auth.js'

const AskBody = z.object({
  query: z.string().min(1).max(2000),
  /**
   * Course scope. Retrieval is limited to these courses. If omitted,
   * behaves as legacy POC: retrieve everything (dev only — in production the
   * client should always pass its user's enrolled course ids).
   *
   * Accepts numbers OR numeric strings for backwards compatibility with older
   * clients; coerced to `number[]` inside the handler.
   */
  courseIds: z
    .array(z.union([z.number().int(), z.string().regex(/^\d+$/)]))
    .transform((arr) => arr.map((v) => (typeof v === 'number' ? v : Number(v))))
    .optional(),
  /**
   * Prior conversation for reference resolution. Client should send the last
   * ~5 turns; rewrite step uses these to turn "how does the first one work?"
   * into a standalone question. Empty/absent = fresh conversation.
   */
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
      }),
    )
    .max(20)
    .optional(),
  options: z
    .object({
      useKeyword: z.boolean().optional(),
      useRerank: z.boolean().optional(),
      escalateOnLowConfidence: z.boolean().optional(),
    })
    .optional()
    .default({}),
  /**
   * Optional chat thread id. If present, the message is appended to that
   * thread. If absent AND user-email header is set, a new thread is created
   * and its id is returned in the response. If no user-email, this field is
   * ignored — ephemeral chats never touch the DB.
   */
  conversationId: z.string().uuid().optional(),
})

/**
 * POST /ask       → creates a session, returns {sessionId}. Does NOT run.
 * GET  /ask/:id/stream (SSE) → runs retrieval, streams answer tokens, then
 *                              emits a final "meta" event with citations,
 *                              watchNext, validation report.
 *
 * Why split: keeps the RN client on GET-only EventSource; also lets the
 * caller cancel between POST and GET without wasting quota.
 */
export async function askRoute(app: FastifyInstance) {
  app.post('/ask', async (req, reply) => {
    const body = AskBody.parse(req.body)

    // Resolve identity. When auth is enabled the JWT drives tenantId +
    // courseIds — any values in the request body are IGNORED (a client that
    // supplied its own courseIds would be attempting to escalate scope).
    // When auth is disabled (dev / POC), body.courseIds is used verbatim.
    let identity: auth.LearnerIdentity
    try {
      identity = requireLearner(req, body.courseIds)
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode ?? 500
      return reply.code(code).send({ error: (err as Error).message })
    }

    // If auth is on and the user is enrolled in nothing, don't even bother
    // running retrieval — return an empty session that will produce zero
    // results. This preserves the invariant "no cross-course leak" even at
    // the retrieval layer.
    const effectiveCourseIds =
      auth.authEnabled() ? identity.courseIds : (body.courseIds ?? identity.courseIds)

    // Persistence path: only kicks in when the caller sends a user-email
    // header AND that email matches a users row. Ephemeral chats (no header
    // or unknown email) skip the DB entirely.
    const emailHeader = (req.headers['user-email'] as string | undefined)?.trim()
    let persistCtx: conversations.UserContext | null = null
    let conversationId: string | undefined
    if (emailHeader) {
      persistCtx = await conversations.resolveUserByEmail(emailHeader)
      if (persistCtx) {
        conversationId = body.conversationId ?? (await conversations.createConversation(persistCtx))
        // Store the user's message immediately so a canceled stream still
        // leaves a trace in history (they can retry from the recorded thread).
        try {
          await conversations.appendMessage({
            conversationId,
            role: 'user',
            content: body.query,
          })
        } catch (err) {
          req.log.warn({ err }, 'failed to persist user message')
        }
      }
    }

    const opts = {
      ...body.options,
      tenantId: identity.tenantId,
      courseIds: effectiveCourseIds.length > 0 ? effectiveCourseIds : undefined,
      history: body.history,
      // Carried through to the SSE stream handler via the session store.
      persist: persistCtx && conversationId
        ? { conversationId, userId: persistCtx.userId, tenantId: persistCtx.tenantId }
        : undefined,
    }
    const session = createSession(body.query, opts)
    reply.code(201).send({ sessionId: session.id, conversationId })
  })

  app.get('/ask/:id/stream', async (req, reply) => {
    const params = req.params as { id: string }
    const session = getSession(params.id)
    if (!session) return reply.code(404).send({ error: 'session not found' })
    if (session.consumed) return reply.code(410).send({ error: 'session already consumed' })
    session.consumed = true

    setSseHeaders(reply, req.headers.origin)
    reply.raw.flushHeaders()

    // Cache short-circuit. Same query + same scope + same options → replay
    // the stored events synchronously. Follow-up queries (with history) bypass
    // cache — different pronouns mean different rewrites mean different answers.
    const opts = session.options as {
      courseIds?: number[]
      useKeyword?: boolean
      useRerank?: boolean
      escalateOnLowConfidence?: boolean
      history?: Array<{ role: string; content: string }>
    }
    const hasHistory = (opts.history?.length ?? 0) > 0
    const cKey = cacheKey({
      query: session.query,
      courseIds: opts.courseIds,
      options: opts,
    })
    const cached = hasHistory ? undefined : getCached(cKey)
    if (cached) {
      sendEvent(reply, 'retrieval', cached.retrievalEvent)
      // Replay the answer text as a single "token" so the UI's streaming
      // rendering doesn't break, then the final answer + validation events.
      sendEvent(reply, 'token', { text: cached.answerText })
      sendEvent(reply, 'answer', cached.answerEvent)
      sendEvent(reply, 'validation', cached.validationEvent)
      sendEvent(reply, 'done', { cached: true })
      reply.raw.end()
      deleteSession(params.id)
      return
    }

    try {
      // Emit stage events as the pipeline advances. UI shows friendly text
      // like "Searching the library…" / "Reading chapters…" so users see
      // progress rather than a spinner.
      sendEvent(reply, 'stage', { stage: 'retrieving', label: 'Searching the library…' })
      // 1. retrieve
      const retrieval = await hybridRetrieve(session.query, session.options as never)
      // Build retrieval payload once so we can both emit and cache it verbatim.
      const retrievalEvent = {
        rewritten: retrieval.rewritten,
        chunks: retrieval.chunks.map((c) => ({
          id: c.id,
          sourceTitle: c.sourceTitle,
          headingTrail: c.headingTrail,
          courseId: c.courseId,
          courseTitle: c.courseTitle,
          moduleId: c.moduleId,
          moduleTitle: c.moduleTitle,
        })),
        videoCues: retrieval.videoCues.map((v) => ({
          id: v.id,
          videoId: v.videoId,
          videoTitle: v.videoTitle,
          playbackUrl: v.playbackUrl,
          startSec: v.startSec,
          text: v.text,
          courseId: v.courseId,
          courseTitle: v.courseTitle,
          moduleId: v.moduleId,
          moduleTitle: v.moduleTitle,
          contentId: v.contentId,
        })),
        lowConfidence: retrieval.lowConfidence,
      }
      sendEvent(reply, 'retrieval', retrievalEvent)

      const contextChunks: ContextChunk[] = retrieval.chunks.map((c, i) => ({
        id: `k${i + 1}`,
        chunkId: c.id,
        headingTrail: c.headingTrail,
        sourceTitle: c.sourceTitle,
        text: c.text,
      }))
      const cueContext: ContextChunk[] = retrieval.videoCues.slice(0, 5).map((v, i) => ({
        id: `v${i + 1}`,
        chunkId: v.id,
        headingTrail: [`video ${v.videoId}`],
        sourceTitle: `Video cue @${v.startSec}s`,
        text: v.text,
        videoId: v.videoId,
        startSec: v.startSec,
      }))
      const allContext = [...contextChunks, ...cueContext]

      // 2. stream tokens
      // Emit an "answering" stage RIGHT before we call the LLM so the UI
      // transitions from "searching…" to "writing your answer…" at the actual
      // moment Flash starts working. Time-to-first-token can be 5-30s
      // depending on Gemini load / retries — the elapsed counter on the
      // frontend keeps the wait visibly alive.
      sendEvent(reply, 'stage', {
        stage: 'answering',
        label: `Writing your answer from ${retrieval.chunks.length} chunk${retrieval.chunks.length === 1 ? '' : 's'}…`,
      })
      let acc = ''
      for await (const token of streamAnswer(session.query, allContext, {
        escalate:
          (session.options as { escalateOnLowConfidence?: boolean }).escalateOnLowConfidence !== false &&
          retrieval.lowConfidence,
        onRetry: (attempt, delayMs) => {
          sendEvent(reply, 'stage', {
            stage: 'rate_limited',
            label: `Model is busy (attempt ${attempt}). Retrying in ${Math.ceil(delayMs / 1000)}s…`,
          })
        },
      })) {
        acc += token
        sendEvent(reply, 'token', { text: token })
      }

      // 3. parse final JSON + validate + emit meta
      const persist = (session.options as { persist?: { conversationId: string; userId: number; tenantId: string } }).persist
      try {
        const parsed = JSON.parse(acc)
        // Selective fallback: only auto-recommend a video when the LLM's
        // answer actually cites a video-sourced chunk (chunk id like
        // "video:<id>:content:...") AND we have cues for that video.
        // This is the stronger "the answer is IN the video" signal — much
        // more discriminating than raw retrieval scores, because it uses
        // the model's own attention to decide relevance.
        const emptyWatchNext =
          !Array.isArray(parsed.watchNext) || parsed.watchNext.length === 0
        if (emptyWatchNext && retrieval.videoCues.length > 0) {
          const citedIds = Array.isArray(parsed.citations)
            ? (parsed.citations as { chunkId?: string }[])
                .map((c) => c.chunkId ?? '')
                .filter(Boolean)
            : []
          const citedVideoIds = new Set<number>()
          for (const cid of citedIds) {
            const m = /^video:(\d+):/.exec(cid)
            if (m) citedVideoIds.add(Number(m[1]))
          }
          if (citedVideoIds.size > 0) {
            // Pick the highest-ranked cue whose videoId was cited by the LLM.
            const match = retrieval.videoCues.find((v) => citedVideoIds.has(v.videoId))
            if (match) {
              parsed.watchNext = [
                {
                  videoId: match.videoId,
                  startSec: match.startSec,
                  reason: `Covers "${match.videoTitle}" — the ${match.startSec}s mark starts the relevant moment.`,
                },
              ]
            }
          }
        }
        const report = validation.validateAnswer(parsed, allContext, retrieval.videoCues)
        const answerEvent = report.cleaned
        const validationEvent = {
          droppedCitations: report.droppedCitations,
          droppedWatchNext: report.droppedWatchNext,
          citationValidityPct: report.citationValidityPct,
        }
        sendEvent(reply, 'answer', answerEvent)
        sendEvent(reply, 'validation', validationEvent)
        // Only cache on a clean run — 100% valid citations means the answer is
        // trustworthy to serve again. Skip caching malformed or partial answers,
        // and skip when this is a follow-up in a conversation (history-dependent).
        if (report.citationValidityPct === 100 && !hasHistory) {
          const toCache: CachedResponse = {
            retrievalEvent,
            answerText: acc,
            answerEvent,
            validationEvent,
          }
          putCached(cKey, toCache)
        }
        // Persist assistant reply into the thread + auto-title on first turn.
        if (persist) {
          persistAssistantAndTitle(persist, session.query, answerEvent, retrievalEvent).catch((err) => {
            req.log.warn({ err }, 'failed to persist assistant message')
          })
        }
      } catch (parseErr) {
        sendEvent(reply, 'error', { message: `answer JSON parse failed: ${(parseErr as Error).message}` })
        // Persist whatever raw text we did stream so the user's history isn't
        // an empty half-turn on a parse failure.
        if (persist) {
          conversations
            .appendMessage({
              conversationId: persist.conversationId,
              role: 'assistant',
              content: acc || '(no response)',
            })
            .catch((err) => req.log.warn({ err }, 'failed to persist fallback assistant message'))
        }
      }

      sendEvent(reply, 'done', { cached: false })
    } catch (err) {
      sendEvent(reply, 'error', { message: (err as Error).message })
    } finally {
      reply.raw.end()
      deleteSession(params.id)
    }
  })
}

function setSseHeaders(reply: FastifyReply, origin?: string | string[]) {
  // The SSE response goes through reply.raw.writeHead which bypasses
  // @fastify/cors — so we mirror the CORS response headers here manually.
  // Without this, the browser rejects the stream even though data is sent.
  const originHeader = Array.isArray(origin) ? origin[0] : origin
  const headers: Record<string, string> = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  }
  if (originHeader) {
    headers['Access-Control-Allow-Origin'] = originHeader
    headers['Access-Control-Allow-Credentials'] = 'true'
    headers['Vary'] = 'Origin'
  }
  reply.raw.writeHead(200, headers)
}

function sendEvent(reply: FastifyReply, event: string, data: unknown) {
  reply.raw.write(`event: ${event}\n`)
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
}

/**
 * After an answer completes, save it to the thread and — if this is the
 * first exchange in a new thread — generate a short title in the background.
 * Errors are swallowed; chat history is best-effort and must never fail the
 * user-facing stream.
 */
async function persistAssistantAndTitle(
  persist: { conversationId: string; userId: number; tenantId: string },
  userQuery: string,
  answer: { answer?: string; citations?: unknown; watchNext?: unknown; followUps?: unknown },
  retrievalEvent: unknown,
): Promise<void> {
  await conversations.appendMessage({
    conversationId: persist.conversationId,
    role: 'assistant',
    content: answer.answer ?? '',
    citations: answer.citations,
    watchNext: answer.watchNext,
    followUps: answer.followUps,
    retrieval: retrievalEvent,
  })

  // If this thread has exactly 2 messages (user + assistant), it's the first
  // turn. Run the auto-titler once.
  const count = await conversations.messageCount(persist.conversationId)
  if (count === 2) {
    const title = await conversations.generateThreadTitle(userQuery)
    if (title) await conversations.setTitle(persist.conversationId, title)
  }
}
