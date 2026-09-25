'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { assetPayload } = require('../src/utils/lessonContent');

test('audio thumbnail supports an HTTP URL, clearing and partial updates', () => {
  assert.equal(assetPayload({ thumbnailUrl: 'https://example.org/audio.png' }, 'AUDIO').thumbnailUrl, 'https://example.org/audio.png');
  assert.equal(assetPayload({ thumbnailUrl: '' }, 'AUDIO').thumbnailUrl, null);
  assert.equal(assetPayload({ thumbnailUrl: null }, 'AUDIO').thumbnailUrl, null);
  assert.equal(Object.hasOwn(assetPayload({ title: 'A lesson' }, 'AUDIO'), 'thumbnailUrl'), false);
  assert.throws(() => assetPayload({ thumbnailUrl: 'javascript:alert(1)' }, 'AUDIO'));
  assert.throws(() => assetPayload({ thumbnailUrl: 'invalid' }, 'AUDIO'));
  assert.equal(Object.hasOwn(assetPayload({ thumbnailUrl: 'https://example.org/a.png' }, 'READ'), 'thumbnailUrl'), false);
});
