'use strict';
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getGumletAudioAsset } = require('../src/utils/gumlet-assets');
const base = process.env.CMS_TEST_URL || 'http://localhost:8006';
const uploaded = [];
let token;
async function api(path, options = {}) {
  const response = await fetch(`${base}/api${path}`, { ...options, headers: { Authorization: `Bearer ${token || ''}`, ...options.headers }, signal: AbortSignal.timeout(180000) });
  const result = await response.json();
  assert.equal(result.success, true, `${path}: ${result.error || result.message}`);
  return result.data;
}
const json = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
async function main() {
  token = (await api('/auth/login', json({ email: process.env.ADMIN_EMAIL || 'admin@example.com', password: process.env.ADMIN_PASSWORD || 'templeadmin' }))).token;
  for (const [kind, mime, filename, bytes] of [
    ['document', 'text/plain', 'cms-test.txt', Buffer.from('TempleLMS upload verification.')],
    ['document', 'application/rtf', 'cms-test.rtf', Buffer.from('{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Arial;}}\\f0\\fs24 TempleLMS formatted document verification.\\par A document becomes an inline PDF.}')],
    ['image', 'image/webp', 'cms-test.webp', fs.readFileSync('../lms-admin-app/public/brand/templeinfo-lotus.webp')],
  ]) {
    const body = new FormData(); body.append('file', new Blob([bytes], { type: mime }), filename);
    const file = await api(`/uploads/${kind}`, { method: 'POST', body });
    uploaded.push(file.key);
    const publicFile = await fetch(file.url, { signal: AbortSignal.timeout(30000) });
    assert.equal(publicFile.status, 200);
    const downloaded = Buffer.from(await publicFile.arrayBuffer());
    if (kind === 'document') {
      assert.equal(file.mimeType, 'application/pdf');
      assert.equal(file.converted, true);
      assert.equal(downloaded.subarray(0, 5).toString(), '%PDF-');
    } else assert.deepEqual(downloaded, bytes);
    console.log(`PASS: authenticated ${kind} upload and public file download`);
  }
  if (process.argv.includes('--uploads-only')) return;
  for (const [kind, id] of [['video', process.env.CMS_QA_VIDEO_ID], ['audio', process.env.CMS_QA_AUDIO_ID]]) {
    assert.ok(id, `Set CMS_QA_${kind.toUpperCase()}_ID to a previously uploaded test asset.`);
    const asset = await api(`/gumlet/assets/${id}`);
    assert.equal(asset.status, 'ready');
    assert.ok(asset.durationMs > 0);
    const playback = kind === 'audio' ? (await getGumletAudioAsset(id)).output.playback_url : asset.playbackUrl;
    const playlist = await fetch(playback, { signal: AbortSignal.timeout(30000) });
    assert.equal(playlist.status, 200);
    assert.ok((await playlist.text()).includes('#EXTM3U'));
    if (kind === 'video') assert.equal((await fetch(asset.thumbnailUrl)).status, 200);
    console.log(`PASS: ${kind} processing, duration, HLS${kind === 'video' ? ' and thumbnail' : ''}`);
  }
  const summary = await api('/lesson-summary', json({ title: 'Serving with care', source: 'Before beginning seva, wash your hands and prepare a clean workspace. Speak respectfully to visitors and fellow volunteers. Ask the coordinator when you are unsure about a task. Complete your work carefully and leave the space clean for the next volunteer.' }));
  assert.ok(summary.summary.length > 50);
  assert.ok(!/<script/i.test(summary.summary));
  console.log('PASS: AI summary generation');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  const s3 = new S3Client({ region: 'auto', endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });
  for (const key of uploaded) {
    try { await s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key })); }
    catch { console.error(`Test object cleanup failed: ${key}`); process.exitCode = 1; }
  }
  s3.destroy();
  if (token) await api('/auth/logout', json({}));
});
