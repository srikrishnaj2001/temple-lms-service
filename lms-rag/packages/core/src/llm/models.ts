/**
 * Model IDs by role. Chat completions go through OpenRouter (OpenAI-compatible),
 * so the ids follow the `provider/model` naming OpenRouter uses. Embeddings
 * still route to Google directly via `embeddings/gemini.ts`.
 *
 * All three chat slots default to a cheap, fast, JSON-mode-capable model.
 * Override any of them per env for tuning without touching code.
 */
export const MODELS = {
  /** cheap, high-frequency: query rewriting, HyDE, rerank */
  fast: process.env.OPENROUTER_MODEL_FAST ?? 'openai/gpt-4o-mini',
  /** main answer synthesis, glossary correction */
  main: process.env.OPENROUTER_MODEL_MAIN ?? 'openai/gpt-4o-mini',
  /** escalation path for low-confidence retrieval / complex answers */
  strong: process.env.OPENROUTER_MODEL_STRONG ?? 'openai/gpt-4o',
  /** text embeddings — 1536 dims via Matryoshka truncation, must L2-normalise */
  embed: process.env.GEMINI_MODEL_EMBED ?? 'gemini-embedding-001',
} as const

export type ModelRole = keyof typeof MODELS
