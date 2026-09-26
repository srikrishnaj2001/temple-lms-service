/**
 * Auto-generate a 4-word chat thread title from the first user question.
 * Runs once, after the first assistant answer completes. If the LLM fails
 * or returns something weird, we fall back silently — the thread just stays
 * untitled (widget shows the first 40 chars of the question).
 */
import { withRetry } from '../llm/client.js'
import { chatComplete } from '../llm/openrouter.js'
import { MODELS } from '../llm/models.js'

const SYSTEM = `You write ultra-short titles for chat threads about a Hindu temple training LMS.
Return JSON: {"title": "..."}
Rules:
- 2 to 5 words, Title Case, no trailing punctuation, no emojis.
- Describe the topic, not the shape ("Festival Prep Courses", not "Question About Festivals").
- If the question is very generic ("hi", "hello"), pick a neutral title like "New Chat".`

export async function generateThreadTitle(firstQuery: string): Promise<string | null> {
  try {
    const res = await withRetry(
      () =>
        chatComplete({
          model: MODELS.fast,
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: `First question: ${firstQuery}` },
          ],
          temperature: 0.2,
          json: true,
        }),
      { attempts: 2 }, // keep this fast/cheap; don't retry forever
    )
    const parsed = JSON.parse(res.text || '{}') as { title?: string }
    const raw = (parsed.title ?? '').trim()
    if (!raw) return null
    // Guardrails: strip anything past 6 words and drop obvious quote wrappers.
    const cleaned = raw
      .replace(/^["'`]+|["'`]+$/g, '')
      .split(/\s+/)
      .slice(0, 6)
      .join(' ')
    return cleaned.length > 0 ? cleaned : null
  } catch {
    return null
  }
}
