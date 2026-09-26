import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { defaultRunConfigs, runEval } from '../eval/harness.js'
import { loadGoldenSet } from '../eval/golden.js'

interface CliArgs {
  golden: string
  out: string
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)
  const out: CliArgs = {
    golden: resolve(process.cwd(), 'fixtures/golden/golden.example.json'),
    out: resolve(process.cwd(), '.cache/eval-report.json'),
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '--golden') out.golden = resolve(args[++i]!)
    else if (a === '--out') out.out = resolve(args[++i]!)
  }
  return out
}

async function main() {
  const args = parseArgs()
  console.log(`[eval] golden set: ${args.golden}`)
  const golden = await loadGoldenSet(args.golden)
  console.log(`[eval] ${golden.length} questions × ${defaultRunConfigs().length} configs`)

  const result = await runEval(golden, defaultRunConfigs())

  await mkdir(dirname(args.out), { recursive: true })
  await writeFile(args.out, JSON.stringify(result, null, 2), 'utf-8')

  console.log('\n=== Aggregate ===')
  for (const run of result.runs) {
    console.log(`\n[${run.config.name}]`)
    console.table(run.aggregate)
    console.log(
      `  gates: recall@10 ${run.gates.recallAt10 ? 'PASS' : 'FAIL'}` +
        `  | video-hit@3 ${run.gates.videoHitAt3 ? 'PASS' : 'FAIL'}` +
        `  | citation-validity ${run.gates.citationValidity ? 'PASS' : 'FAIL'}`,
    )
  }
  console.log(`\n[eval] full report → ${args.out}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
