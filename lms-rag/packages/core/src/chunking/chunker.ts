import { config } from '../config.js'
import { MAX_INPUT_TOKENS } from '../embeddings/gemini.js'
import { countTokens } from './tokens.js'

export interface SourceDoc {
  id: string
  title: string
  /** markdown-ish text with # / ## / ### headings; tables kept as GFM */
  text: string
}

export interface Chunk {
  chunkId: string
  sourceId: string
  sourceTitle: string
  headingTrail: string[]
  text: string
  tokens: number
  ordinal: number
}

interface Block {
  kind: 'heading' | 'paragraph' | 'table' | 'list'
  level?: number
  text: string
}

/**
 * Structural chunker.
 * Atomic-unit rule: never split a table or list mid-item. Headings become
 * the boundary; paragraphs are the granularity. Target ~425 tokens per
 * chunk; oversized atomic blocks (a giant table) are emitted as a single
 * chunk and asserted below MAX_INPUT_TOKENS - 128 (margin vs the 2048 hard
 * cap) so the embed API never sees a 400.
 */
export function chunkDocument(doc: SourceDoc): Chunk[] {
  const targetTokens = config().CHUNK_TARGET_TOKENS
  const maxAtomic = MAX_INPUT_TOKENS - 128
  const blocks = parseBlocks(doc.text)

  const chunks: Chunk[] = []
  let ordinal = 0
  const headingStack: string[] = []
  let buffer: Block[] = []
  let bufferTokens = 0

  const flush = () => {
    if (buffer.length === 0) return
    const text = renderBlocks(buffer)
    const tokens = countTokens(text)
    if (tokens > maxAtomic) {
      throw new Error(
        `Chunk ${doc.id}#${ordinal} is ${tokens} tokens (max ${maxAtomic}). ` +
          `An atomic block (table/list) exceeds the embedding input cap; split the source or increase CHUNK_MAX_TOKENS.`,
      )
    }
    chunks.push({
      chunkId: `${doc.id}#${ordinal}`,
      sourceId: doc.id,
      sourceTitle: doc.title,
      headingTrail: [...headingStack],
      text,
      tokens,
      ordinal,
    })
    ordinal++
    buffer = []
    bufferTokens = 0
  }

  for (const block of blocks) {
    if (block.kind === 'heading') {
      flush()
      const level = block.level ?? 1
      headingStack.length = Math.max(0, level - 1)
      headingStack.push(block.text)
      continue
    }
    const blockTokens = countTokens(block.text)
    // atomic blocks (table, list) never split
    if (block.kind === 'table' || block.kind === 'list') {
      if (bufferTokens + blockTokens > targetTokens && buffer.length > 0) flush()
      buffer.push(block)
      bufferTokens += blockTokens
      continue
    }
    // paragraphs: split greedily on target
    if (bufferTokens + blockTokens > targetTokens && buffer.length > 0) {
      flush()
    }
    buffer.push(block)
    bufferTokens += blockTokens
  }
  flush()
  return chunks
}

// --- block parser -----------------------------------------------------------

function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    // heading
    const h = /^(#{1,6})\s+(.*)$/.exec(line)
    if (h) {
      blocks.push({ kind: 'heading', level: h[1]!.length, text: h[2]!.trim() })
      i++
      continue
    }
    // table (GFM)
    if (isTableStart(lines, i)) {
      const start = i
      while (i < lines.length && lines[i]!.trim().startsWith('|')) i++
      blocks.push({ kind: 'table', text: lines.slice(start, i).join('\n') })
      continue
    }
    // list
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const start = i
      while (i < lines.length && (/^\s*([-*+]|\d+\.)\s+/.test(lines[i]!) || /^\s+\S/.test(lines[i]!))) i++
      blocks.push({ kind: 'list', text: lines.slice(start, i).join('\n') })
      continue
    }
    // blank line = separator
    if (line.trim() === '') {
      i++
      continue
    }
    // paragraph: consume until blank / heading / table / list
    const start = i
    while (
      i < lines.length &&
      lines[i]!.trim() !== '' &&
      !/^(#{1,6})\s+/.test(lines[i]!) &&
      !isTableStart(lines, i) &&
      !/^\s*([-*+]|\d+\.)\s+/.test(lines[i]!)
    ) {
      i++
    }
    blocks.push({ kind: 'paragraph', text: lines.slice(start, i).join('\n') })
  }
  return blocks
}

function isTableStart(lines: string[], i: number): boolean {
  const a = lines[i]?.trim() ?? ''
  const b = lines[i + 1]?.trim() ?? ''
  return a.startsWith('|') && /^\|?\s*:?-+:?/.test(b)
}

function renderBlocks(blocks: Block[]): string {
  return blocks
    .map((b) => b.text.trim())
    .filter((t) => t.length > 0)
    .join('\n\n')
}
