import type { Config } from 'drizzle-kit'

/**
 * drizzle-kit config — used only for generating migration SQL after schema
 * changes. The runtime migrator lives in src/scripts/migrate.ts and applies
 * hand-authored SQL from src/db/migrations, so we can control CREATE INDEX
 * IF NOT EXISTS wording and idempotency directly.
 */
export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
} satisfies Config
