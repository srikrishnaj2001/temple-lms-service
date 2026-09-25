'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { seedVideoForId } = require('../src/utils/gumlet-seed-assets');
const catalog = require('../seed-data/gumlet-seed-assets.json');
const axios = require('axios');
const { getGumletAsset } = require('../src/utils/gumlet-assets');

test('all seed assets fetch fresh streams and thumbnails from Gumlet in every environment', async () => {
  const oldGet = axios.get;
  const oldKey = process.env.GUMLET_API_KEY;
  const oldEnv = process.env.NODE_ENV;
  process.env.GUMLET_API_KEY = 'test-only-secret';
  try {
    let calls = 0;
    axios.get = async (url) => {
      calls++;
      const assetId = url.split('/').pop();
      assert.ok(catalog.videos.some((asset) => asset.assetId === assetId));
      return { data: { status: 'ready', output: {
        playback_url: `https://cdn.example.org/stream-${calls}.m3u8`,
        thumbnail_url: [`https://cdn.example.org/poster-${calls}.png`]
      } } };
    };
    for (const env of ['development', 'production']) {
      process.env.NODE_ENV = env;
      for (const asset of catalog.videos) {
        const result = await getGumletAsset(asset.assetId);
        assert.equal(result.output.playback_url, `https://cdn.example.org/stream-${calls}.m3u8`);
        assert.equal(result.output.thumbnail_url[0], `https://cdn.example.org/poster-${calls}.png`);
      }
    }
    assert.equal(calls, 12);
    delete process.env.GUMLET_API_KEY;
    await assert.rejects(getGumletAsset(catalog.videos[0].assetId), /not configured/);
    assert.equal(calls, 12);
  } finally {
    axios.get = oldGet;
    if (oldKey === undefined) delete process.env.GUMLET_API_KEY;
    else process.env.GUMLET_API_KEY = oldKey;
    if (oldEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldEnv;
  }
});

test('seed mapping is stable, covers six assets, and does not invent transcripts or summaries', () => {
  const ids = new Set();
  for (const id of [111, 121, 211, 221, 311, 321]) {
    const video = seedVideoForId(id);
    ids.add(video.externalVideoId);
    assert.deepEqual(video, seedVideoForId(id));
    assert.ok(video.durationMs > 0);
    assert.equal(video.summary, null);
    assert.equal(video.transcript, null);
    assert.match(video.externalResources[0].url, /^https:\/\/www.youtube.com\/watch/);
  }
  assert.equal(ids.size, 6);
  assert.throws(() => seedVideoForId(-1));
});

test('non-seed assets use the authenticated API and redact upstream request secrets', async () => {
  const oldGet = axios.get;
  const oldKey = process.env.GUMLET_API_KEY;
  const id = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  process.env.GUMLET_API_KEY = 'test-only-secret';
  try {
    let calls = 0;
    axios.get = async (url, options) => {
      calls++;
      assert.equal(url, `https://api.gumlet.com/v1/video/assets/${id}`);
      assert.equal(options.headers.Authorization, 'Bearer test-only-secret');
      return { data: { status: 'ready', output: { playback_url: 'https://example.org/main.m3u8' } } };
    };
    assert.equal((await getGumletAsset(id)).status, 'ready');
    assert.equal(calls, 1);
    await assert.rejects(getGumletAsset('../invalid'), /Invalid Gumlet asset ID/);
    assert.equal(calls, 1);
    axios.get = async () => {
      const error = new Error('test-only-secret');
      error.response = { status: 403 };
      error.config = { headers: { Authorization: 'Bearer test-only-secret' } };
      throw error;
    };
    await assert.rejects(getGumletAsset(id), (error) => {
      assert.match(error.message, /workspace API key/);
      assert.equal(error.config, undefined);
      assert.equal(String(error).includes('test-only-secret'), false);
      return true;
    });
  } finally {
    axios.get = oldGet;
    if (oldKey === undefined) delete process.env.GUMLET_API_KEY;
    else process.env.GUMLET_API_KEY = oldKey;
  }
});
