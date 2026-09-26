import { readFile } from 'node:fs/promises'
import { z } from 'zod'

const TermSchema = z.object({
  term: z.string().min(1),
  variants: z.array(z.string()).default([]),
  definition: z.string().min(1),
})

const GlossarySchema = z.array(TermSchema)

export type GlossaryTerm = z.infer<typeof TermSchema>
export type Glossary = z.infer<typeof GlossarySchema>

export async function loadGlossary(path: string): Promise<Glossary> {
  const raw = await readFile(path, 'utf-8')
  const parsed = GlossarySchema.parse(JSON.parse(raw))
  return parsed
}

export function renderGlossaryForPrompt(terms: Glossary): string {
  return terms
    .map((g) => {
      const alsoWritten = g.variants.length > 0 ? ` (also written: ${g.variants.join(', ')})` : ''
      return `${g.term}${alsoWritten} — ${g.definition}`
    })
    .join('\n')
}
