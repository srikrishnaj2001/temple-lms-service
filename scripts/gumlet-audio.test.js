'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { selectAudioStream } = require('../src/utils/gumlet-assets');
const { assetPayload } = require('../src/utils/lessonContent');
const axios = require('axios');
const { getGumletAudioAsset } = require('../src/utils/gumlet-assets');
const base = 'https://video.gumlet.io/workspace/asset/main.m3u8';

test('selects audio rendition without guessing Gumlet filenames', () => {
  const master = '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="English, stereo",DEFAULT=YES,URI="sound.m3u8?token=test"\n';
  assert.equal(selectAudioStream(master, base), 'https://video.gumlet.io/workspace/asset/sound.m3u8?token=test');
});
test('supports audio-only variant playlists', () => {
  assert.equal(selectAudioStream('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=128000,CODECS="mp4a.40.2"\naudio.m3u8', base), 'https://video.gumlet.io/workspace/asset/audio.m3u8');
});
test('does not return a video-only or untrusted rendition as audio', () => {
  assert.throws(() => selectAudioStream('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=128000,CODECS="avc1.64001f,mp4a.40.2"\nvideo.m3u8', base));
  assert.throws(() => selectAudioStream('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="Audio",URI="https://evil.example/a.m3u8"', base));
});
test('validates Gumlet audio IDs and permits a nullable legacy URL', () => {
  assert.equal(assetPayload({ externalAudioId: '6aa7c47e07a6f8ff2989d412', url: '' }, 'AUDIO').url, null);
  assert.throws(() => assetPayload({ externalAudioId: 'not-an-id' }, 'AUDIO'));
});

test('fetches current audio playlist and thumbnail, with no auth key on CDN requests', async t => {
  const previous = process.env.GUMLET_API_KEY;
  process.env.GUMLET_API_KEY = 'test-key';
  t.after(() => { if (previous === undefined) delete process.env.GUMLET_API_KEY; else process.env.GUMLET_API_KEY = previous; });
  let calls = 0;
  t.mock.method(axios, 'get', async (url, config) => {
    calls++;
    if (url.startsWith('https://api.gumlet.com/')) {
      assert.equal(config.headers.Authorization, 'Bearer test-key');
      return { data: { status: 'ready', output: { playback_url: base, thumbnail_url: ['https://video.gumlet.io/current.png'] } } };
    }
    assert.equal(config.headers, undefined);
    assert.equal(config.maxRedirects, 0);
    return { data: '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="English",URI="sound.m3u8"' };
  });
  const asset = await getGumletAudioAsset('6aa7c47e07a6f8ff2989d412');
  assert.equal(asset.output.thumbnail_url[0], 'https://video.gumlet.io/current.png');
  assert.equal(asset.output.playback_url, 'https://video.gumlet.io/workspace/asset/sound.m3u8');
  assert.equal(calls, 2);
});
