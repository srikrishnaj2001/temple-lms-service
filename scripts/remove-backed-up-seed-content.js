'use strict';
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');
const base = 'http://127.0.0.1:8006/api';

async function main() {
  const dir = process.argv[2];
  if (!dir || !process.argv.includes('--confirm-delete-seed-content')) throw new Error('Provide the verified backup directory and --confirm-delete-seed-content.');
  if (!fs.statSync(path.join(dir, 'before-admin-reset.dump')).size) throw new Error('Database backup is missing.');
  const snapshot = JSON.parse(fs.readFileSync(path.join(dir, 'snapshot.json'), 'utf8'));
  if (snapshot.courses.length !== 100 || snapshot.courses.some(row => row.id < 1 || row.id > 100 || row.tenantId !== '8daf17bc-7c43-44b7-ba3b-67d8a439e072')) throw new Error('Unexpected course scope; inspect manually.');
  const progressFile = path.join(dir, 'admin-deletions.json');
  const done = new Set(fs.existsSync(progressFile) ? JSON.parse(fs.readFileSync(progressFile, 'utf8')) : []);
  let token;
  async function request(route, method = 'GET', data) {
    const response = await fetch(`${base}${route}`, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, ...(data && { body: JSON.stringify(data) }) });
    if (response.status === 429) {
      const seconds = Number(response.headers.get('retry-after')) || 900;
      console.log(`Admin request limit reached; waiting ${seconds}s before continuing.`);
      await sleep((seconds + 1) * 1000);
      return request(route, method, data);
    }
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(`${method} ${route}: ${result.error || result.message}`);
    return result.data;
  }
  token = (await request('/auth/login', 'POST', { email: process.env.ADMIN_EMAIL || 'admin@example.com', password: process.env.ADMIN_PASSWORD || 'templeadmin' })).token;
  try {
    const groups = ['announcements', 'enrollments', 'contents', 'modules', 'courses', 'resources', 'videos', 'audios', 'reads', 'categories'];
    for (const group of groups) {
      const rows = snapshot[group].filter(row => !row.deletedAt);
      for (const row of rows) {
        const route = `/${group}/${row.id}`;
        if (done.has(route)) continue;
        await request(route, 'DELETE');
        done.add(route);
        fs.writeFileSync(progressFile, JSON.stringify([...done], null, 2), { mode: 0o600 });
      }
      console.log(`Removed ${rows.length} seeded ${group} through admin API.`);
    }
    console.log('Seed catalog removed. Users, roles, tenants, R2 objects and Gumlet media preserved.');
  } finally { await request('/auth/logout', 'POST', {}); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
