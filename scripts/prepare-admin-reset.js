'use strict';
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const dir = path.resolve('../.local-media/backups', new Date().toISOString().replace(/[:.]/g, '-'));
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const url = new URL(process.env.DATABASE_URL);
    execFileSync('pg_dump', ['--format=custom', '--file', path.join(dir, 'before-admin-reset.dump')], {
      env: { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: url.pathname.slice(1) },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    fs.chmodSync(path.join(dir, 'before-admin-reset.dump'), 0o600);
    const snapshot = {};
    const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows;
    for (const { tablename } of tables) snapshot[tablename] = (await client.query(`SELECT * FROM "${tablename.replaceAll('"', '""')}"`)).rows;
    fs.writeFileSync(path.join(dir, 'snapshot.json'), JSON.stringify(snapshot, null, 2), { mode: 0o600 });
    console.log('Backup:', dir);
    for (const table of ['courses', 'modules', 'contents', 'enrollments', 'resources', 'videos', 'audios', 'reads', 'categories', 'announcements']) {
      console.log(table, snapshot[table]?.length);
    }
    const linked = new Set(snapshot.contents.filter(x => x.contentType === 'RESOURCE').map(x => x.contentId));
    console.log('Unlinked resources:', snapshot.resources.filter(x => !linked.has(x.id)).map(x => ({ id: x.id, title: x.title })));
    console.log('Audio:', snapshot.audios.map(x => ({ id: x.id, title: x.title })));
    console.log('Quick reads:', snapshot.reads.map(x => ({ id: x.id, title: x.title })));
  } finally { await client.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
