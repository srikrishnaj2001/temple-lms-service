import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { config } from '../config.js'

/**
 * Learner identity, extracted from the LMS-signed JWT. The RAG API uses
 * these fields to scope EVERY retrieval — never accepts client-supplied
 * courseIds or tenantId when auth is enabled.
 */
export interface LearnerIdentity {
  userId: string
  tenantId: string
  /** Course IDs the learner is enrolled in. Retrieval filters by ANY(courseIds). */
  courseIds: number[]
  /** Optional role string ('learner' | 'admin' | ...) — LMS decides its own vocabulary. */
  role?: string
  /** Raw claims, in case downstream code needs the whole payload. */
  raw: Record<string, unknown>
}

/**
 * Claims contract the LMS must produce. Names chosen to be short (JWTs live
 * in headers, so bytes matter) and unambiguous.
 *
 * Registered claims we care about:
 *   `sub`  — the userId
 *   `iat`, `exp` — verified by jsonwebtoken
 *
 * Custom claims:
 *   `tenant` (string UUID)
 *   `courses` (array of course id integers)
 *   `role`   (optional string)
 */
const ClaimsSchema = z
  .object({
    sub: z.string().min(1),
    tenant: z.string().uuid(),
    // Accept numbers OR numeric strings for backwards compat; coerce to number.
    courses: z
      .array(z.union([z.number().int(), z.string().regex(/^\d+$/)]))
      .default([])
      .transform((arr) => arr.map((v) => (typeof v === 'number' ? v : Number(v)))),
    role: z.string().optional(),
  })
  .passthrough()

/**
 * Verify a bearer token (raw JWT string, WITHOUT the "Bearer " prefix).
 * Throws on any failure — invalid signature, expired, missing claims,
 * or unexpected issuer/audience. Callers should map thrown errors to 401.
 */
export function verifyLearnerToken(token: string): LearnerIdentity {
  const c = config()
  if (!c.LMS_JWT_SECRET) {
    throw new Error('LMS_JWT_SECRET not configured — refusing to verify tokens')
  }

  const payload = jwt.verify(token, c.LMS_JWT_SECRET, {
    algorithms: ['HS256', 'HS384', 'HS512'],
    ...(c.LMS_JWT_ISSUER ? { issuer: c.LMS_JWT_ISSUER } : {}),
    ...(c.LMS_JWT_AUDIENCE ? { audience: c.LMS_JWT_AUDIENCE } : {}),
  })

  if (typeof payload === 'string') {
    throw new Error('Unexpected string JWT payload')
  }

  const parsed = ClaimsSchema.safeParse(payload)
  if (!parsed.success) {
    throw new Error(
      `JWT claims missing required fields: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    )
  }

  return {
    userId: parsed.data.sub,
    tenantId: parsed.data.tenant,
    courseIds: parsed.data.courses,
    role: parsed.data.role,
    raw: payload as Record<string, unknown>,
  }
}

/** Whether the API is running in authenticated mode. */
export function authEnabled(): boolean {
  return !!config().LMS_JWT_SECRET
}
