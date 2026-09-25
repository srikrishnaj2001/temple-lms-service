const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'upload-iskcon-seed-videos.js'), 'utf8');
const directory = path.resolve(__dirname, '../../.local-media/iskcon-bangalore');
const manifestPath = path.join(directory, 'manifest.json');
const statePath = path.join(directory, 'gumlet-upload-state.json');
const collection = '123456789012345678901234';

async function execute({ mode = '--plan', state, failCreate = false, confirmed = collection, ready = false, budget } = {}) {
  const videos = Array.from({ length: 30 }, (_, index) => ({
    youtubeId: `video${String(index).padStart(6, '0')}`,
    title: `Video ${index}`, sourceUrl: `https://www.youtube.com/watch?v=video${String(index).padStart(6, '0')}`,
    file: `video${String(index).padStart(6, '0')}.mp4`, status: 'downloaded', bytes: 100,
    durationSeconds: 60, width: 1280, height: 720, gumletAssetId: null,
  }));
  const files = new Map([[manifestPath, JSON.stringify({ videos, channelUrl: 'https://www.youtube.com/@iskconbangalore/videos' })]]);
  for (const item of videos) files.set(path.join(directory, item.file), 'media');
  if (state) files.set(statePath, JSON.stringify(state));
  const calls = [];
  const client = {
    post: async () => {
      calls.push('POST');
      if (failCreate) throw new Error('Connection lost');
      return { data: { asset_id: 'abcdef123456789012345678', upload_url: 'https://uploads.amazonaws.com/file?signed=yes' } };
    },
    get: async () => {
      calls.push('GET');
      return { data: { status: ready ? 'ready' : 'upload-pending', output: { playback_url: ready ? 'https://video.gumlet.io/test/main.m3u8' : null } } };
    },
  };
  const processMock = { argv: ['node', 'script', mode, `--collection=${confirmed}`], env: { GUMLET_API_KEY: 'test-only', GUMLET_COLLECTION_ID: collection } };
  if (budget !== undefined) processMock.argv.push(`--budget-minutes=${budget}`);
  const logs = [];
  await vm.runInNewContext(source, {
    __dirname, URL, process: processMock,
    console: { log: message => logs.push(message), error: message => logs.push(message) },
    require: name => {
      if (name === 'dotenv') return { config() {} };
      if (name === 'node:path') return path;
      if (name === 'node:fs') return {
        readFileSync: file => files.get(file), existsSync: file => files.has(file),
        statSync: () => ({ size: 100 }),
        writeFileSync: (file, value) => files.set(file, value),
        renameSync: (from, to) => { files.set(to, files.get(from)); files.delete(from); },
        createReadStream: () => 'mock-stream',
      };
      if (name === 'axios') return { create: () => client, put: async () => calls.push('PUT') };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return { files, calls, logs, exitCode: processMock.exitCode || 0 };
}

test('plan validates files without contacting Gumlet', async () => {
  const result = await execute();
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.calls, []);
});

test('storage budget selects a bounded subset without network calls', async () => {
  const result = await execute({ budget: 10 });
  assert.equal(result.exitCode, 0);
  assert.match(result.logs[0], /^10 videos, 10.00 minutes/);
  assert.deepEqual(result.calls, []);
});

test('invalid storage budget fails before contacting Gumlet', async () => {
  const result = await execute({ budget: -1 });
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.calls, []);
});

test('workspace mismatch prevents every network call', async () => {
  const result = await execute({ mode: '--upload', confirmed: 'wrong-workspace' });
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.calls, []);
});

test('ambiguous creation persists intent and does not retry', async () => {
  const first = await execute({ mode: '--upload', failCreate: true });
  assert.equal(first.exitCode, 1);
  assert.deepEqual(first.calls, ['POST']);
  const state = JSON.parse(first.files.get(statePath));
  assert.equal(state.assets.video000000.status, 'create-requested');
  const second = await execute({ mode: '--upload', state });
  assert.equal(second.exitCode, 1);
  assert.deepEqual(second.calls, []);
});

test('status on an unuploaded batch cannot create assets', async () => {
  const result = await execute({ mode: '--status' });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.calls, []);
});

test('ready assets are reused and IDs survive download verification', async () => {
  const assets = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [
    `video${String(i).padStart(6, '0')}`, { assetId: String(i).padStart(24, '0'), status: 'ready' },
  ]));
  const result = await execute({ mode: '--upload', ready: true, state: { collectionId: collection, assets } });
  assert.equal(result.exitCode, 0);
  assert.ok(result.calls.every(call => call === 'GET'));
  const manifest = JSON.parse(result.files.get(manifestPath));
  assert.equal(manifest.videos[29].gumletAssetId, String(29).padStart(24, '0'));
});
