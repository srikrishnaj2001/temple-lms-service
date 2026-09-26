import type { FastifyInstance, FastifyRequest } from 'fastify'
import { auth } from '@ai-guru/core'
import { DEV_TENANT_ID } from '@ai-guru/core/db'

/**
 * Learner auth. Attaches `req.learner` (if present) to every request based
 * on the Authorization: Bearer <jwt> header. The token must be minted by
 * the LMS with { sub, tenant, courses[] } claims.
 *
 * When LMS_JWT_SECRET is UNSET, this is a no-op — /ask runs unauthenticated
 * (POC-only convenience; MUST set the secret before production).
 *
 * Handlers that need auth should check `req.learner` themselves and 401 if
 * missing — this hook doesn't reject requests globally so /health and other
 * public routes stay accessible.
 */

declare module 'fastify' {
  interface FastifyRequest {
    learner?: auth.LearnerIdentity
  }
}

export function registerLearnerAuth(app: FastifyInstance) {
  const enabled = auth.authEnabled()
  app.log.info({ msg: enabled ? 'Learner auth ENABLED' : 'Learner auth DISABLED — LMS_JWT_SECRET not set' })

  app.addHook('onRequest', async (req: FastifyRequest) => {
    if (!enabled) return
    const header = req.headers.authorization
    if (!header || !header.toLowerCase().startsWith('bearer ')) return
    const token = header.slice(7).trim()
    if (!token) return
    try {
      req.learner = auth.verifyLearnerToken(token)
    } catch (err) {
      req.log.warn({ err: (err as Error).message }, 'JWT verify failed')
      // Don't 401 here — let the route decide. That way public routes
      // stay accessible even if a stale/bad token is attached by a client
      // that's authenticated to something else.
    }
  })
}

/**
 * Enforce learner auth on a route. Call at the top of a route handler.
 * Returns the identity, or sends 401 and throws so the handler stops.
 *
 * In dev / POC mode (auth disabled), returns a "public" identity with
 * whatever courseIds the client passed — matches the current unauth POC
 * behaviour so existing widgets keep working.
 */
export function requireLearner(req: FastifyRequest, fallbackCourseIds?: number[]): auth.LearnerIdentity {
  if (req.learner) return req.learner
  if (!auth.authEnabled()) {
    return {
      userId: 'anonymous',
      tenantId: DEV_TENANT_ID,
      courseIds: fallbackCourseIds ?? [],
      raw: {},
    }
  }
  // Auth enabled but no valid learner on the request → reject.
  const err = new Error('Unauthorized: missing or invalid bearer token')
  ;(err as { statusCode?: number }).statusCode = 401
  throw err
}
