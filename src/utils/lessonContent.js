'use strict';
const { sanitize } = require('./sanitizeHtml');

function httpUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('A valid http or https URL is required');
  let url;
  try { url = new URL(value); } catch { throw new Error('A valid http or https URL is required'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http and https URLs are supported');
  return url.href;
}

function supplementaryPayload(data) {
  const result = {};
  if (data.summary !== undefined) result.summary = sanitize(data.summary || '');
  if (data.transcript !== undefined) {
    if (data.transcript !== null && typeof data.transcript !== 'string') throw new Error('Transcript must be text');
    result.transcript = data.transcript || '';
  }
  if (data.externalResources !== undefined) {
    if (!Array.isArray(data.externalResources) || data.externalResources.length > 50) throw new Error('External resources must be a list of up to 50 links');
    result.externalResources = data.externalResources.map((link) => {
      if (!link || typeof link.title !== 'string' || !link.title.trim()) throw new Error('Every external resource needs a title');
      return { title: link.title.trim().slice(0, 255), url: httpUrl(link.url), description: String(link.description || '').slice(0, 2000) };
    });
  }
  return result;
}

function assetPayload(data, kind) {
  const result = supplementaryPayload(data);
  if (data.title !== undefined) {
    if (typeof data.title !== 'string' || !data.title.trim() || data.title.trim().length > 255) throw new Error('Title must contain 1 to 255 characters');
    result.title = data.title.trim();
  }
  if (data.description !== undefined) result.description = String(data.description || '');
  if (kind === 'AUDIO') {
    if (data.externalAudioId !== undefined) {
      if (data.externalAudioId && !/^[a-f0-9]{24}$/i.test(data.externalAudioId)) throw new Error('A valid Gumlet asset ID is required');
      result.externalAudioId = data.externalAudioId || null;
    }
    if (data.url !== undefined) result.url = data.url ? httpUrl(data.url) : null;
    if (data.thumbnailUrl !== undefined) result.thumbnailUrl = data.thumbnailUrl === '' || data.thumbnailUrl === null ? null : httpUrl(data.thumbnailUrl);
    if (data.durationMs !== undefined) {
      if (data.durationMs !== null && (!Number.isInteger(data.durationMs) || data.durationMs < 0)) throw new Error('Duration must be a non-negative integer');
      result.durationMs = data.durationMs;
    }
  } else {
    delete result.transcript;
    if (data.body !== undefined) {
      result.body = sanitize(data.body);
      if (!result.body.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()) throw new Error('Read content is required');
    }
  }
  return result;
}
module.exports = { supplementaryPayload, assetPayload, httpUrl };
