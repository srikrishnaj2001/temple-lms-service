import { ask } from '../ask.js'

const query = process.argv[2] ?? 'What time does the temple kitchen open?'
const courseArg = process.argv[3]
const courseIds = courseArg
  ? courseArg.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n))
  : undefined

try {
  const result = await ask(query, {
    useKeyword: false,
    useRerank: false,
    courseIds,
  })
  console.log(JSON.stringify(result, null, 2))
} catch (err) {
  console.error('FAILED:', err)
  process.exit(1)
}
