# lms-rag

RAG chatbot + semantic-search service for Temple LMS. Runs as a standalone
Fastify server alongside `lms-service` (Express API), `lms-app` (Next.js
learner), and `lms-admin-app` (Vite admin).

## What this service does

- **Hybrid retrieval** across course/module/video text + video subtitle cues
  using vector search (Gemini embeddings + pgvector HNSW) fused with
  Postgres full-text search via Reciprocal Rank Fusion.
- **Streamed chat answers** with grounded citations, video recommendations
  with jump-to-timestamp, follow-up suggestions.
- **Persistent chat history** per learner (thread list, message replay,
  auto-generated 4-word titles).
- **Instant library search** (typing) with a guardrailed AI fallback on
  submit — off-topic questions are politely declined.
- **Ingest pipeline** for pulling course text + video transcripts (Gumlet
  VTT/SRT) into the RAG index.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 20.10 | check `node -v` |
| pnpm | ≥ 9 | `npm i -g pnpm` |
| Postgres | 16 with **pgvector** | Supabase works out of the box; local Docker needs `pgvector/pgvector:pg16` image (NOT stock `postgres:16`) |
| Docker (optional) | any | Only for local dev if you don't have Postgres elsewhere |

## Environment variables

All variables live in `lms-rag/.env` (root of this folder). The service walks
up from CWD to find the nearest `.env`, so subpackage scripts pick up the
same file.

### Required

| Variable | What / where to get it |
|---|---|
| `GEMINI_API_KEY` | Embeddings only. Free tier: https://aistudio.google.com/apikey . Free-tier limits: 15 RPM, 1500 RPD for `gemini-embedding-001`. Enable billing for production loads. |
| `OPENROUTER_API_KEY` | Chat completions (rewrite, rerank, answer). Get at https://openrouter.ai/keys . Reuse the key already in `lms-service/.env`. |
| `DATABASE_URL` | Postgres connection string. Must have `CREATE EXTENSION vector` enabled. Example: `postgresql://user:pass@ep-xxx.supabase.co:5432/postgres?sslmode=require` |

### Recommended (production)

| Variable | Purpose |
|---|---|
| `LMS_JWT_SECRET` | HMAC secret shared with lms-service. If set, `/ask` verifies a Bearer JWT with `{ sub, tenant, courses[] }` claims. If UNSET, the endpoint runs in TRUST mode and accepts caller-supplied `courseIds` — POC only. |
| `LMS_JWT_ISSUER` | Optional. If set, tokens with a different `iss` are rejected. |
| `LMS_JWT_AUDIENCE` | Optional. If set, tokens with a different `aud` are rejected. |
| `ADMIN_TOKEN` | Gates `/admin/*` routes. lms-service should forward it as `Authorization: Bearer <ADMIN_TOKEN>` on ingest webhooks. |

### Optional (features / tuning)

| Variable | Default | Purpose |
|---|---|---|
| `GUMLET_API_KEY` | — | Fetches VTT/SRT from Gumlet for video ingest. Reuse the key from `lms-service/.env`. |
| `GUMLET_API_BASE` | `https://api.gumlet.com/v1` | Only override for regional endpoints. |
| `OPENROUTER_MODEL_FAST` | `openai/gpt-4o-mini` | Query rewrite, HyDE, rerank, auto-title. |
| `OPENROUTER_MODEL_MAIN` | `openai/gpt-4o-mini` | Main answer generation + guardrailed search fallback. |
| `OPENROUTER_MODEL_STRONG` | `openai/gpt-4o` | Escalation path when confidence is low. |
| `GEMINI_MODEL_EMBED` | `gemini-embedding-001` | Embedding model. |
| `GEMINI_EMBED_MIN_INTERVAL_MS` | `1200` | Throttle between embed batches. Bump to `4000` for free tier (15 RPM). |
| `GEMINI_BILLING_ENABLED` | `false` | Purely informational — logs use this to hide "enable billing" hints. |
| `ENABLE_STRONG_ESCALATION` | `false` | If true, low-confidence answers escalate to the `strong` model. |
| `API_PORT` | `3000` | HTTP port. |
| `API_HOST` | `127.0.0.1` | Bind address. Change to `0.0.0.0` for container hosts. |
| `INGEST_POLL_MS` | `3000` | Background ingest worker poll interval (ms). |
| `INGEST_BATCH_SIZE` | `1` | Jobs processed per poll cycle. |
| `INGEST_WORKER_DISABLED` | — | Set to `1` to run API-only (no background ingest). Useful when scaling out. |
| `MAX_CUES_PER_VIDEO` | `3` | Retrieval dedupe cap. |
| `MAX_VIDEOS` | `5` | Retrieval dedupe cap. |
| `VIDEO_MIN_ABSOLUTE_SCORE` | `0.015` | RRF floor for video recommendations. |
| `CHUNK_TARGET_TOKENS` | `425` | Token target when chunking a source. |
| `CHUNK_MAX_TOKENS` | `1800` | Hard cap on a single chunk. |
| `CACHE_DIR` | `.cache` | On-disk cache root (answers). |
| `EMBEDDING_CACHE_DIR` | `.cache/embeddings` | Embedding cache. Never delete this in production — recomputing costs money. |
| `SKIP_REWRITE_HEURISTIC` | `auto` | `auto` / `always` / `never` / `off`. Controls whether the LLM rewrite step runs. |
| `SEARCH_FALLBACK_LEXICAL_MIN_MATCH` | `1` | Number of query words that must appear in a top library title before search skips the AI fallback. |
| `OPENROUTER_REFERRER` | — | Sent as `HTTP-Referer` to OpenRouter (optional, helps their analytics). |
| `OPENROUTER_APP_TITLE` | — | Sent as `X-Title` to OpenRouter (optional). |

### Windows-specific gotcha

Google's `@google/genai` SDK checks `GOOGLE_API_KEY` before `GEMINI_API_KEY`.
If your Windows user profile has an old `GOOGLE_API_KEY` set at the OS level,
it will silently override the one in `.env` and can bypass your quota. Two
fixes:

```bash
# override for the current process
GOOGLE_API_KEY="$(grep '^GEMINI_API_KEY=' .env | cut -d= -f2)" pnpm dev
```

Or remove the OS-level env var permanently:
```powershell
[Environment]::SetEnvironmentVariable('GOOGLE_API_KEY', '', 'User')
```

## Quick start

```bash
# from lms-rag/
cp .env.example .env
# fill in GEMINI_API_KEY, OPENROUTER_API_KEY, DATABASE_URL (at minimum)

pnpm install
pnpm --filter @ai-guru/core build      # first time only; api imports core dist/
pnpm --filter @ai-guru/core migrate    # creates rag_* tables + enables pgvector

# ingest text (courses / modules / video titles + descriptions)
pnpm --filter @ai-guru/core exec tsx src/scripts/ingest-lms-content.ts

# ingest video transcripts from Gumlet (skips videos with no subtitles)
pnpm --filter @ai-guru/core exec tsx src/scripts/ingest-video-transcripts.ts

# start the API
pnpm dev
# listening on http://127.0.0.1:3000
```

Smoke test:
```bash
curl http://127.0.0.1:3000/health
curl -X POST http://127.0.0.1:3000/search -H "Content-Type: application/json" \
  -d '{"query":"festival preparation"}'
```

## Repository layout

```
lms-rag/
├── apps/
│   └── api/                 # Fastify HTTP server
│       ├── src/
│       │   ├── server.ts    # entry point
│       │   ├── routes/      # /ask, /search, /conversations, /admin, /health
│       │   ├── sse/         # SSE session store + answer cache
│       │   ├── learner-auth.ts / admin-auth.ts
│       │   └── queue-worker.ts
│       └── package.json
├── packages/
│   └── core/                # RAG logic (portable — no Fastify deps)
│       ├── src/
│       │   ├── db/          # Drizzle schema + client + SQL migrations
│       │   ├── embeddings/  # Gemini embed wrapper + on-disk cache
│       │   ├── retrieval/   # vector + keyword + hybrid RRF
│       │   ├── llm/         # OpenRouter client + rewrite/generate/rerank
│       │   ├── ingest/      # document + video ingest pipelines
│       │   ├── conversations/ # chat history service + auto-title
│       │   ├── gumlet/      # Gumlet API client + VTT/SRT parsers
│       │   ├── glossary/    # optional term correction pass
│       │   ├── chunking/    # token-based chunker
│       │   ├── validation/  # citation + watchNext post-flight check
│       │   └── scripts/     # migrate, ingest-*, list-chunks, reset, etc.
│       └── package.json
├── fixtures/                # sample VTTs + glossary example
├── package.json             # workspace root — `pnpm dev` proxies to apps/api
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## HTTP endpoints

All URLs are relative to `API_HOST:API_PORT`.

### `GET /health`
Liveness check. Returns `{ ok: true, ts: ISO }`.

### `POST /ask`
Create a chat session. Body:
```json
{
  "query": "how do I welcome first-time visitors?",
  "courseIds": [1, 5, 12],
  "history": [{ "role": "user", "content": "..." }],
  "conversationId": "uuid-if-continuing-a-thread"
}
```
Headers: `user-email: alice@example.com` (persists to a thread) or absent (ephemeral).
Response: `{ sessionId, conversationId? }` — GET the stream next.

### `GET /ask/:sessionId/stream`
SSE stream. Events emitted:
- `stage` — `{ stage, label }` — progress ("Searching…", "Answering…")
- `retrieval` — `{ rewritten, chunks[], videoCues[] }`
- `token` — `{ text }` — streamed answer text
- `answer` — final structured `{ answer, confidence, citations[], watchNext[], followUps[] }`
- `validation` — `{ droppedCitations, droppedWatchNext, citationValidityPct }`
- `done` — `{ cached: boolean }`
- `error` — `{ message }`

### `POST /search`
Body:
```json
{ "query": "prasadam", "courseIds": [1, 5], "limit": 5, "submit": false }
```
- `submit: false` (default) — retrieval-only, ~200ms cached, ~1s cold
- `submit: true` — also runs the guardrailed AI fallback (temple-only), ~3-5s

Response:
```json
{
  "query": "...",
  "results": {
    "courses":  [{ id, title, description, snippet, url: "/learn/5" }],
    "modules":  [{ id, title, courseTitle, courseId, url: "/learn/5?s=..." }],
    "videos":   [{ videoId, contentId, courseId, title, courseTitle, moduleTitle, snippet, url }]
  },
  "hasStrongMatches": true,
  "aiAnswer": "...",       // present when submit=true and library was weak/off
  "aiDeclined": false      // true when the guardrail rejected an off-topic query
}
```

### `GET /conversations`
Requires `user-email` header. Returns `{ conversations: [{ id, title, updatedAt, createdAt }] }`.

### `GET /conversations/:id/messages`
Requires `user-email`. Returns `{ messages: [{ id, role, content, citations, watchNext, followUps, retrieval, createdAt }] }`.

### `DELETE /conversations/:id`
Requires `user-email`. Cascade-deletes the thread + all its messages.

### `POST /admin/modules/:moduleId/text` `POST /admin/modules/:moduleId/video` `POST /admin/modules/:moduleId/video-from-gumlet`
Enqueues an ingest job. Gated by `ADMIN_TOKEN` if set.

## Scripts

Run from `lms-rag/` root (proxied via workspace):

| Command | What it does |
|---|---|
| `pnpm dev` | Start the API in watch mode (tsx watch) |
| `pnpm migrate` | Apply SQL migrations from `packages/core/src/db/migrations/` |
| `pnpm --filter @ai-guru/core exec tsx src/scripts/ingest-lms-content.ts` | Bulk-ingest course/module/video text from the lms-service DB |
| `pnpm --filter @ai-guru/core exec tsx src/scripts/ingest-video-transcripts.ts` | Fetch VTT from Gumlet for every video → chunk → embed → store in `rag_video_cues` |
| `pnpm --filter @ai-guru/core exec tsx src/scripts/ingest-video-transcripts.ts --video 611` | Same but for one specific videoId |
| `pnpm list-chunks` | Print recent chunks from the DB (debug) |
| `pnpm list-models` | List OpenRouter model IDs currently available |
| `pnpm reset` | ⚠️ Drop-and-recreate all `rag_*` tables. Use for a clean slate. |

## Deployment notes

- **DB**: Supabase Postgres is the fastest — pgvector is preinstalled. Just create the database and set `DATABASE_URL`.
- **API host**: Any Node 20+ container works (Render, Railway, Fly, DigitalOcean App Platform). Set `API_HOST=0.0.0.0`.
- **Ingest**: On first deploy, run `pnpm migrate` then the two ingest scripts once. The background worker inside the API handles subsequent ingests from admin webhooks.
- **Secrets**: Move every `.env` value into the host's secret manager. Rotate every key that was committed to git before public exposure.
- **CORS**: `apps/api/src/server.ts` opens `origin: true` in dev. Lock it down to your lms-app + lms-admin-app domains in production.
- **JWT**: Set `LMS_JWT_SECRET` and update lms-service to mint tokens with `{ sub, tenant, courses[] }` claims. The widget then calls `getToken({ template: 'rag' })` from Clerk.

## Common issues

| Symptom | Cause + fix |
|---|---|
| `PostgresError: extension "vector" is not available` | Postgres image lacks pgvector. Use `pgvector/pgvector:pg16` locally, or Supabase in prod. |
| `429 exceeded your current quota` on ingest | Gemini free tier hit. Set `GEMINI_EMBED_MIN_INTERVAL_MS=4000` or enable billing. |
| "Both GOOGLE_API_KEY and GEMINI_API_KEY are set" | See [Windows-specific gotcha](#windows-specific-gotcha) above. |
| Widget prints "answer JSON parse failed" | LLM returned malformed JSON. Non-fatal — the assistant message shows the raw stream text. Check `apps/api` log for the failing model output. |
| SSE stream shows `connection lost` in browser | Older code missed CORS headers on the SSE response. Fix already in `apps/api/src/routes/ask.ts:setSseHeaders`. |
| Search never returns an AI answer | By design when library has relevant hits. Press Enter (sets `submit: true`) to force AI. |
| Search always shows the same video | The seeder duplicated a handful of Gumlet asset IDs across many `videos` rows. Upload real per-course videos to Gumlet + re-ingest. |
