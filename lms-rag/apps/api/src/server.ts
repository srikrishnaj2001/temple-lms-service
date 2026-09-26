import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { config } from '@ai-guru/core'
import { registerAdminAuth } from './admin-auth.js'
import { registerLearnerAuth } from './learner-auth.js'
import { startIngestQueue } from './queue-worker.js'
import { adminRoute } from './routes/admin.js'
import { askRoute } from './routes/ask.js'
import { conversationsRoute } from './routes/conversations.js'
import { healthRoute } from './routes/health.js'
import { searchRoute } from './routes/search.js'

async function build() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    trustProxy: true,
    // SSE responses need per-request timeout disabled
    connectionTimeout: 0,
    keepAliveTimeout: 60_000,
  })

  // CORS is handled by the Express app in lms-service, which proxies /rag/*
  // to this internal-only port — this process is never reached directly
  // from a browser, so it doesn't need to set its own CORS headers (and
  // shouldn't, to avoid duplicate Access-Control-Allow-Origin headers).
  await app.register(cors, { origin: false, credentials: true })

  registerAdminAuth(app)
  registerLearnerAuth(app)

  await app.register(healthRoute)
  await app.register(adminRoute)
  await app.register(askRoute)
  await app.register(searchRoute)
  await app.register(conversationsRoute)

  return app
}

async function main() {
  const { API_PORT, API_HOST } = config()
  const app = await build()
  await app.listen({ port: API_PORT, host: API_HOST })

  // Kick off the ingest worker AFTER the API is listening so admin webhooks
  // can enqueue jobs and the worker will process them in the background.
  // Set INGEST_WORKER_DISABLED=1 to run a stateless API-only replica.
  if (process.env.INGEST_WORKER_DISABLED !== '1') {
    startIngestQueue(app.log)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
