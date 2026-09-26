import { embedOne } from '../embeddings/gemini.js'
import { vectorSearchChunks, vectorSearchVideoCues } from '../retrieval/vector.js'
import { keywordSearchChunks, keywordSearchVideoCues } from '../retrieval/keyword.js'

/**
 * Confirms none of the four retrieval functions return the embedding column
 * in their result set. Embeddings are 1536 × 4 bytes = ~6 KB per row (12 KB
 * with pgvector's text serialization overhead); returning them for every
 * candidate adds real network + parse cost.
 */

async function main() {
  const q = 'What are the three sub-departments of Treasury?'
  const qvec = await embedOne(q, 'RETRIEVAL_QUERY')

  const [dc, kc, dv, kv] = await Promise.all([
    vectorSearchChunks(qvec, 3),
    keywordSearchChunks(q, 3),
    vectorSearchVideoCues(qvec, 3),
    keywordSearchVideoCues(q, 3),
  ])

  const dump = (label: string, arr: unknown[]) => {
    const first = arr[0] as Record<string, unknown> | undefined
    const cols = first ? Object.keys(first) : []
    const bytes = first ? JSON.stringify(first).length : 0
    const hasEmbedding = cols.some((k) => k.toLowerCase().includes('embed'))
    console.log(`\n${label} (${arr.length} rows, ${bytes} bytes/row):`)
    console.log('  columns:', cols.join(', '))
    console.log('  contains embedding?', hasEmbedding ? '❌ YES (bad)' : '✅ no (correct)')
  }

  dump('vectorSearchChunks',    dc)
  dump('keywordSearchChunks',   kc)
  dump('vectorSearchVideoCues', dv)
  dump('keywordSearchVideoCues', kv)

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
