import type { FastifyInstance, FastifyRequest } from 'fastify'

/**
 * Simple bearer-token check for admin routes. ADMIN_TOKEN in env gates
 * everything under /admin/*. When the real LMS lands with its own auth
 * (JWT/session/etc), replace this hook with the LMS-issued token check.
 *
 * Leaves POC-critical open routes (GET /health, POST /ask, GET /courses) alone.
 */
const ADMIN_PREFIX = '/admin/'

export function registerAdminAuth(app: FastifyInstance) {
  const token = process.env.ADMIN_TOKEN
  if (!token) {
    app.log.warn('ADMIN_TOKEN not set — admin routes are UNAUTHENTICATED. Set ADMIN_TOKEN in .env before exposing this API.')
    return
  }
  app.addHook('preHandler', async (req: FastifyRequest, reply) => {
    if (!req.url.startsWith(ADMIN_PREFIX)) return
    const header = req.headers['authorization']
    if (typeof header !== 'string' || header !== `Bearer ${token}`) {
      reply.code(401).send({ error: 'unauthorized' })
    }
  })
}
