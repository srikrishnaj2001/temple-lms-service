/**
 * Chat history endpoints for signed-in users.
 *
 * Auth: mirrors the lms-service convention — every request must include a
 * `user-email` header. If the email doesn't match a users row (or the header
 * is missing), we 401. Ephemeral chats never touch this router.
 */
import type { FastifyInstance } from 'fastify'
import { conversations } from '@ai-guru/core'

async function requireUser(email: string | undefined) {
  if (!email) return { error: 'user-email header required', status: 401 as const }
  const ctx = await conversations.resolveUserByEmail(email)
  if (!ctx) return { error: 'user not found in lms-service users table', status: 401 as const }
  return { ctx }
}

export async function conversationsRoute(app: FastifyInstance) {
  // GET /conversations — list threads for the current user
  app.get('/conversations', async (req, reply) => {
    const email = (req.headers['user-email'] as string | undefined)?.trim()
    const auth = await requireUser(email)
    if ('error' in auth) return reply.code(auth.status ?? 401).send({ error: auth.error })
    const list = await conversations.listConversations(auth.ctx)
    return reply.send({ conversations: list })
  })

  // GET /conversations/:id/messages — load messages for one thread
  app.get('/conversations/:id/messages', async (req, reply) => {
    const email = (req.headers['user-email'] as string | undefined)?.trim()
    const auth = await requireUser(email)
    if ('error' in auth) return reply.code(auth.status ?? 401).send({ error: auth.error })
    const { id } = req.params as { id: string }
    const messages = await conversations.getMessages(auth.ctx, id)
    if (messages === null) return reply.code(404).send({ error: 'conversation not found' })
    return reply.send({ messages })
  })

  // DELETE /conversations/:id — remove a thread + its messages
  app.delete('/conversations/:id', async (req, reply) => {
    const email = (req.headers['user-email'] as string | undefined)?.trim()
    const auth = await requireUser(email)
    if ('error' in auth) return reply.code(auth.status ?? 401).send({ error: auth.error })
    const { id } = req.params as { id: string }
    const ok = await conversations.deleteConversation(auth.ctx, id)
    if (!ok) return reply.code(404).send({ error: 'conversation not found' })
    return reply.code(204).send()
  })
}
