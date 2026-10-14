'use strict';

/**
 * Run pending database migrations at boot, before the HTTP server starts
 * accepting traffic.
 *
 * Why this exists: the Render image installs with `npm ci --only=production`,
 * so sequelize-cli is not present at runtime, and the container start command
 * is just `node src/server.js`. Without this, a deploy that ships a model
 * change reaches production before its migration does — and because Sequelize
 * selects every declared attribute by name, a single missing column takes down
 * every route that touches that table, not just the new feature.
 *
 * The on-disk format is identical to sequelize-cli's: migrations live in
 * ../migrations, are applied in filename order, and applied names are recorded
 * in the "SequelizeMeta" table. Running the CLI locally and this at boot are
 * interchangeable.
 */

const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
const { sequelize } = require('../models');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

// Arbitrary but fixed — any two instances booting at once must pick the same
// number for the lock to actually serialize them.
const ADVISORY_LOCK_KEY = 4711_2026;

async function appliedMigrations() {
  await sequelize.query(
    'CREATE TABLE IF NOT EXISTS "SequelizeMeta" ("name" VARCHAR(255) NOT NULL, PRIMARY KEY ("name"))'
  );
  const rows = await sequelize.query('SELECT "name" FROM "SequelizeMeta"', {
    type: Sequelize.QueryTypes.SELECT,
  });
  return new Set(rows.map((row) => row.name));
}

function migrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.js') && !file.endsWith('.test.js'))
    .sort();
}

/**
 * Apply every migration that has not run yet.
 *
 * Holds a transaction-scoped Postgres advisory lock for the duration so that two instances
 * booting at the same time cannot run the same migration twice — the second
 * one blocks, then sees the first one's "SequelizeMeta" rows and no-ops.
 *
 * Throws if a migration fails. The caller is expected to exit rather than
 * serve traffic against a half-migrated schema.
 */
async function runMigrations() {
  // Keep the lock on one transaction/connection. A session lock acquired and
  // released through independent pooled queries can leak or protect the wrong
  // connection, especially behind Supabase's transaction pooler.
  return sequelize.transaction(async (lockTransaction) => {
    await sequelize.query('SELECT pg_advisory_xact_lock(:key)', {
      replacements: { key: ADVISORY_LOCK_KEY },
      transaction: lockTransaction,
    });
    const done = await appliedMigrations();
    const pending = migrationFiles().filter((file) => !done.has(file));

    if (pending.length === 0) {
      console.log('[migrate] schema up to date');
      return { applied: [] };
    }

    console.log(`[migrate] ${pending.length} pending migration(s)`);
    const queryInterface = sequelize.getQueryInterface();

    for (const file of pending) {
      const migration = require(path.join(MIGRATIONS_DIR, file));
      if (typeof migration.up !== 'function') {
        throw new Error(`Migration ${file} has no up() export`);
      }
      const startedAt = Date.now();
      await migration.up(queryInterface, Sequelize);
      await sequelize.query('INSERT INTO "SequelizeMeta" ("name") VALUES (:name)', {
        replacements: { name: file },
      });
      console.log(`[migrate] applied ${file} (${Date.now() - startedAt}ms)`);
    }

    return { applied: pending };
  });
}

module.exports = { runMigrations };
