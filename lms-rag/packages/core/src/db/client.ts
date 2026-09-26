import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { config } from '../config.js'
import * as schema from './schema.js'

let cached: ReturnType<typeof drizzle> | undefined
let cachedSql: ReturnType<typeof postgres> | undefined

export function db() {
  if (!cached) {
    cachedSql = postgres(config().DATABASE_URL, {
      max: 10,
      idle_timeout: 30,
      prepare: false, // pgvector-with-drizzle friendliness
    })
    cached = drizzle(cachedSql, { schema })
  }
  return cached
}

/** Raw postgres.js client — used for pgvector similarity queries where
 *  drizzle's operator support is thin. */
export function rawSql() {
  if (!cachedSql) db() // side-effect init
  return cachedSql!
}
