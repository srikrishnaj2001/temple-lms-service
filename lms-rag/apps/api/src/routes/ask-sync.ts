import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { hybridRetrieve } from '@ai-guru/core/retrieval'
import { generateAnswer, type ContextChunk } from '@ai-guru/core/llm'
import { validation, auth, conversations } from '@ai-guru/core'
import { requireLearner } from '../learner-auth.js'

/**
 * One-shot (non-streaming) sibling of /ask.
 *
 * Purpose: ElevenLabs / Retell / any voice-agent platform that lets you
 * configure a "tool" — they make ONE HTTP request and expect ONE JSON body
 * back with the final answer. They can't consume our SSE stream.
 *
 * Same retrieval + LLM pipeline as /ask, just wrapped in a single response
 * instead of the POST-then-GET-SSE dance. Persists the exchange to the same
 * rag_conversations / rag_messages tables when a user-email header is present
 * (with channel='voice' so the widget can distinguish text vs voice turns).
 *
 * Latency budget: ~3-5s end-to-end. The voice agent covers this with a "one
 * moment…" filler while it waits.
 */
const AskSyncBody = z.object({
  query: z.string().min(1).max(2000),
  courseIds: z
    .array(z.union([z.number().int(), z.string().regex(/^\d+$/)]))
    .transform((arr) => arr.map((v) => (typeof v === 'number' ? v : Number(v))))
    .optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
      }),
    )
    .max(20)
    .optional(),
  conversationId: z.string().uuid().optional(),
  /**
   * Marks the caller as a voice channel so we tag persisted messages
   * accordingly. Default 'voice' for this endpoint since it's the primary
   * intended use, but text callers can override.
   */
  channel: z.enum(['voice', 'text']).optional().default('voice'),
})

export async function askSyncRoute(app: FastifyInstance) {
  app.post('/ask/sync', async (req, reply) => {
    const parseResult = AskSyncBody.safeParse(req.body)
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'invalid request',
        details: parseResult.error.issues,
      })
    }
    const body = parseResult.data

    // Same auth pathway as /ask. When LMS_JWT_SECRET is unset (dev/POC),
    // callers can supply courseIds directly; when set, JWT drives scope.
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

    // Optional persistence: only when a user-email header is present AND
    // resolves to a real users row. Same rules as /ask.
    const emailHeader = (req.headers['user-email'] as string | undefined)?.trim()
    let persistCtx: conversations.UserContext | null = null
    let conversationId: string | undefined
    if (emailHeader) {
      persistCtx = await conversations.resolveUserByEmail(emailHeader)
      if (persistCtx) {
        conversationId = body.conversationId ?? (await conversations.createConversation(persistCtx))
        // Record the user's question immediately so a mid-pipeline crash
        // still leaves a trace in history.
        try {
          await conversations.appendMessage({
            conversationId,
            role: 'user',
            content: body.query,
            channel: body.channel,
          })
        } catch (err) {
          req.log.warn({ err }, 'failed to persist user message (sync)')
        }
      }
    }

    try {
      // 1. Retrieve
      const retrieval = await hybridRetrieve(body.query, {
        tenantId: identity.tenantId,
        courseIds: effectiveCourseIds.length > 0 ? effectiveCourseIds : undefined,
        history: body.history,
      } as never)

      // 2. Build context (same shape as /ask streaming path)
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

      // 3. Generate answer (non-streaming — one round trip to the LLM)
      let parsed = await generateAnswer(body.query, allContext)

      // 4. Apply the same deterministic watchNext fallback the streaming
      //    route uses, so voice callers can announce videos too.
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
          const match = retrieval.videoCues.find((v) => citedVideoIds.has(v.videoId))
          if (match) {
            parsed = {
              ...parsed,
              watchNext: [
                {
                  videoId: match.videoId,
                  startSec: match.startSec,
                  reason: `Covers "${match.videoTitle}" — the ${match.startSec}s mark is the relevant moment.`,
                },
              ],
            }
          }
        }
      }

      // 5. Validate (drops citations / watchNext referring to context we
      //    didn't actually retrieve — same safety net as /ask).
      const report = validation.validateAnswer(parsed, allContext, retrieval.videoCues)

      // 6. Persist the assistant reply into the thread.
      if (persistCtx && conversationId) {
        conversations
          .appendMessage({
            conversationId,
            role: 'assistant',
            content: report.cleaned.answer ?? '',
            citations: report.cleaned.citations,
            watchNext: report.cleaned.watchNext,
            followUps: report.cleaned.followUps,
            retrieval: {
              rewritten: retrieval.rewritten,
              chunks: retrieval.chunks.slice(0, 6),
              videoCues: retrieval.videoCues.slice(0, 5),
            },
            channel: body.channel,
          })
          .catch((err) => req.log.warn({ err }, 'failed to persist assistant message (sync)'))

        // First exchange? Auto-title it in the background.
        conversations
          .messageCount(conversationId)
          .then(async (count) => {
            if (count === 2 && conversationId) {
              const title = await conversations.generateThreadTitle(body.query)
              if (title) await conversations.setTitle(conversationId, title)
            }
          })
          .catch(() => {
            /* best-effort */
          })
      }

      // 7. Response — the shape the voice agent tool reads.
      return reply.send({
        conversationId,
        answer: report.cleaned.answer ?? '',
        confidence: report.cleaned.confidence,
        citations: report.cleaned.citations,
        watchNext: report.cleaned.watchNext,
        followUps: report.cleaned.followUps,
        // Retrieval metadata — optional for the caller. ElevenLabs will
        // only read `answer`; the widget uses these for the video card.
        retrieval: {
          rewritten: retrieval.rewritten,
          videoCues: retrieval.videoCues.slice(0, 5).map((v) => ({
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
        },
      })
    } catch (err) {
      req.log.error({ err }, '/ask/sync failed')
      return reply.code(500).send({
        error: 'answer generation failed',
        message: (err as Error).message,
      })
    }
  })
}
