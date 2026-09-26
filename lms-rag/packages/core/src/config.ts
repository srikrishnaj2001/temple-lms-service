import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { z } from 'zod'

// Walk up from CWD to find the nearest .env — needed because pnpm runs scripts
// from the workspace package dir, not the repo root where .env lives.
function loadEnvFromRoot() {
  let dir = process.cwd()
  for (let i = 0; i < 6; i++) {
    const p = resolve(dir, '.env')
    if (existsSync(p)) {
      loadEnv({ path: p })
      return
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  // fall back to default (also harmless if none found)
  loadEnv()
}
loadEnvFromRoot()

const bool = (v: unknown) => v === 'true' || v === '1'

const EnvSchema = z.object({
  // Gemini is used for embeddings only (OpenRouter doesn't do embeddings).
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required (embeddings)'),
  GEMINI_BILLING_ENABLED: z.preprocess(bool, z.boolean()).default(false),

  // OpenRouter serves the chat completion models (fast / main / strong).
  OPENROUTER_API_KEY: z.string().min(1, 'OPENROUTER_API_KEY is required (chat)'),

  ENABLE_STRONG_ESCALATION: z.preprocess(bool, z.boolean()).default(false),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  CACHE_DIR: z.string().default('.cache'),
  EMBEDDING_CACHE_DIR: z.string().default('.cache/embeddings'),
  EVAL_LLM_CACHE_DIR: z.string().default('.cache/eval'),

  API_PORT: z.coerce.number().default(3000),
  API_HOST: z.string().default('127.0.0.1'),
  ADMIN_TOKEN: z.string().optional(),

  // JWT verification secret. The LMS signs a short-lived token with
  // `{ sub: userId, tenant: tenantUUID, courses: [courseId,...] }` using this
  // shared secret; the RAG API verifies with jsonwebtoken. If unset, /ask
  // runs UNAUTHENTICATED and trusts client-supplied courseIds — POC only.
  LMS_JWT_SECRET: z.string().optional(),
  /** Accepted `iss` claim on the JWT. If set, tokens with a different issuer are rejected. */
  LMS_JWT_ISSUER: z.string().optional(),
  /** Accepted `aud` claim. Same rules. */
  LMS_JWT_AUDIENCE: z.string().optional(),

  // Gumlet transcript API. Only needed if you want the RAG to auto-fetch
  // subtitles for a video (instead of the caller uploading VTT manually).
  GUMLET_API_KEY: z.string().optional(),
  GUMLET_API_BASE: z.string().default('https://api.gumlet.com/v1'),

  CHUNK_TARGET_TOKENS: z.coerce.number().default(425),
  CHUNK_MAX_TOKENS: z.coerce.number().default(1800),
})

export type Config = z.infer<typeof EnvSchema>

let cached: Config | undefined

/**
 * Lazy-parsed config. Fails loud on missing required env at first access
 * so ingest/eval scripts don't get halfway through before erroring.
 */
export function config(): Config {
  if (!cached) {
    const parsed = EnvSchema.safeParse(process.env)
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
      throw new Error(`Invalid environment:\n${issues}`)
    }
    cached = parsed.data
  }
  return cached
}
