import { config } from '../config.js'

const key = config().GEMINI_API_KEY
const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=200`)
const data = (await res.json()) as {
  models?: Array<{ name: string; displayName?: string; supportedGenerationMethods?: string[] }>
}
if (!data.models) {
  console.log(JSON.stringify(data, null, 2))
  process.exit(1)
}
const rows = data.models
  .filter((m) => /flash|pro|embed/i.test(m.name))
  .sort((a, b) => a.name.localeCompare(b.name))
for (const m of rows) {
  console.log(`${m.name.padEnd(50)} ${(m.supportedGenerationMethods ?? []).join(',')}`)
}
