import { encode } from 'gpt-tokenizer'

/**
 * Gemini doesn't ship a public tokenizer for JS; cl100k is close enough for
 * budgeting chunk size (typically ±10% vs Gemini's actual count). The hard
 * cap check in the chunker uses this — the runtime 2048-token limit from the
 * embed API is authoritative, so we assert below it with margin.
 */
export function countTokens(text: string): number {
  return encode(text).length
}
