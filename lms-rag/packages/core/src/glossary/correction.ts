import { withRetry } from '../llm/client.js'
import { chatComplete } from '../llm/openrouter.js'
import { MODELS } from '../llm/models.js'
import type { Glossary } from './loader.js'
import { renderGlossaryForPrompt } from './loader.js'

export interface Cue {
  id: string
  startSec: number
  endSec: number
  text: string
}

/**
 * Prompt is prescriptive on purpose: fix ONLY misheard words. Paraphrasing
 * would rewrite the timeline. Cue count and order must match input —
 * enforced by the post-flight check below.
 */
function buildSystemPrompt(glossary: Glossary): string {
  return `You correct auto-generated transcripts of Hindu temple operations training content.
Common ASR errors involve domain vocabulary. Use this glossary of correct terms:

${renderGlossaryForPrompt(glossary)}

Rules:
- Return the SAME NUMBER of cues, in the SAME ORDER, with cue ids unchanged.
- Correct only misheard words. Do not paraphrase, summarise, reorder, or add content.
- Do not change timestamps.
- If a cue is already correct, return it unchanged.

Return a JSON object {"cues": [{"id": "...", "text": "..."}, ...]} — the order and length of "cues" MUST match the input. Return only the JSON.`
}

export interface CorrectionOptions {
  /** ~60 cues ≈ 5 minutes of video per call — the sweet spot for latency vs context */
  batchSize?: number
}

export async function correctTranscript(
  cues: Cue[],
  glossary: Glossary,
  opts: CorrectionOptions = {},
): Promise<Cue[]> {
  const batchSize = opts.batchSize ?? 60
  const system = buildSystemPrompt(glossary)
  const out: Cue[] = []

  for (let start = 0; start < cues.length; start += batchSize) {
    const batch = cues.slice(start, start + batchSize)
    const inputPayload = batch.map((c) => ({ id: c.id, text: c.text }))

    const res = await withRetry(() =>
      chatComplete({
        model: MODELS.main,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `Input cues (JSON):\n${JSON.stringify(inputPayload)}` },
        ],
        temperature: 0,
        json: true,
      }),
    )

    let parsed: { cues: { id: string; text: string }[] }
    try {
      parsed = JSON.parse(res.text || '{"cues":[]}') as {
        cues: { id: string; text: string }[]
      }
    } catch {
      throw new Error(
        `Glossary correction returned invalid JSON for batch starting at ${start}. Rejecting to protect timeline integrity.`,
      )
    }
    const parsedCues = parsed.cues ?? []

    if (parsedCues.length !== batch.length) {
      throw new Error(
        `Glossary correction returned ${parsedCues.length} cues for ${batch.length} input cues (batch starting at ${start}). Rejecting to protect timeline integrity.`,
      )
    }
    for (let i = 0; i < batch.length; i++) {
      if (parsedCues[i]!.id !== batch[i]!.id) {
        throw new Error(
          `Glossary correction returned id ${parsedCues[i]!.id} at position ${i}, expected ${batch[i]!.id}. Rejecting batch.`,
        )
      }
      out.push({
        id: batch[i]!.id,
        startSec: batch[i]!.startSec,
        endSec: batch[i]!.endSec,
        text: parsedCues[i]!.text,
      })
    }
  }

  return out
}
