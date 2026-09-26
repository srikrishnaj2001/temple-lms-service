import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { rawSql } from '../db/client.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '..', 'db', 'migrations')

/**
 * Applies migrations idempotently. We keep this dead-simple (no version
 * tracking table) for the POC; every migration must be idempotent (CREATE
 * ... IF NOT EXISTS everywhere). If we survive to production, swap for
 * drizzle-kit's migrator.
 */
async function main() {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort()
  if (files.length === 0) {
    console.log('No migrations found')
    return
  }
  const sql = rawSql()
  for (const file of files) {
    const path = join(MIGRATIONS_DIR, file)
    const content = await readFile(path, 'utf-8')
    console.log(`Applying ${file}...`)
    await sql.unsafe(content)
  }
  console.log(`Applied ${files.length} migration(s).`)
  await sql.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
