import { encode } from 'gpt-tokenizer'
import { hybridRetrieve } from '../retrieval/hybrid.js'
import { buildContext, type ContextChunk } from '../llm/generate.js'

/**
 * Runs a real hybrid retrieval, builds the context block that would be sent
 * to Flash, and reports token counts for each piece. Uses cl100k tokenizer
 * (Gemini's actual token counts are typically within ±10%).
 */

const SYSTEM_PROMPT_APPROX = `You are a friendly chatbot for a Hindu temple operations training LMS...` // approx, real one is longer
const SCHEMA_APPROX = JSON.stringify({
  type: 'OBJECT',
  properties: {
    answer: 'string',
    confidence: 'high|medium|low',
    citations: [{ id: 'string', chunkId: 'string' }],
    watchNext: [{ videoId: 'string', startSec: 0, reason: 'string' }],
    readNext: ['string'],
    followUps: ['string'],
  },
})

async function main() {
  const query = process.argv[2] ?? 'What are the three sub-departments of Treasury?'
  console.log(`Query: "${query}"\n`)

  const retrieval = await hybridRetrieve(query, {
    useKeyword: true,
    useRerank: false,
  })

  const contextChunks: ContextChunk[] = retrieval.chunks.map((c, i) => ({
    id: `k${i + 1}`,
    chunkId: c.id,
    headingTrail: c.headingTrail,
    sourceTitle: c.sourceTitle,
    text: c.text,
  }))

  // ask.ts includes up to VIDEO_INCLUDE_MAX_CUES cues (default 2)
  const MAX_CUES = Number(process.env.VIDEO_INCLUDE_MAX_CUES ?? '2')
  const cueContext: ContextChunk[] = retrieval.videoCues.slice(0, MAX_CUES).map((v, i) => ({
    id: `v${i + 1}`,
    chunkId: v.id,
    headingTrail: [`video ${v.videoId}`],
    sourceTitle: `Video cue @${v.startSec}s`,
    text: v.text,
    videoId: v.videoId,
    startSec: v.startSec,
  }))

  const allContext = [...contextChunks, ...cueContext]
  const contextBlock = buildContext(allContext)
  const fullPrompt = `${SYSTEM_PROMPT_APPROX}\n\nContext:\n${contextBlock}\n\nQuestion: ${query}`

  const contextTokens = encode(contextBlock).length
  const systemTokens = encode(SYSTEM_PROMPT_APPROX).length
  const schemaTokens = encode(SCHEMA_APPROX).length
  const queryTokens = encode(query).length
  const total = encode(fullPrompt).length + schemaTokens

  console.log(`Retrieved: ${retrieval.chunks.length} chunks + ${cueContext.length} video cues`)
  console.log(`\nInput tokens (approx via cl100k):`)
  console.log(`  system prompt:  ${systemTokens.toString().padStart(6)}`)
  console.log(`  context chunks: ${contextTokens.toString().padStart(6)}   ← the big one, scales with finalK`)
  console.log(`  schema:         ${schemaTokens.toString().padStart(6)}`)
  console.log(`  user query:     ${queryTokens.toString().padStart(6)}`)
  console.log(`  --------------------`)
  console.log(`  TOTAL input:    ${total.toString().padStart(6)} tokens`)

  console.log(`\nPer chunk breakdown:`)
  for (const c of contextChunks.slice(0, 5)) {
    console.log(`  ${c.id.padEnd(4)} ${encode(c.text).length.toString().padStart(4)} tokens — ${c.sourceTitle.slice(0, 40)}...`)
  }
  if (contextChunks.length > 5) console.log(`  ... (+${contextChunks.length - 5} more)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
