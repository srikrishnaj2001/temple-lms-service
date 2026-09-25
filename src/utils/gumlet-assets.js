'use strict';

const axios = require('axios');
const { Parser } = require('m3u8-parser');

function gumletUrl(value, base) {
  const url = new URL(value, base);
  if (url.protocol !== 'https:' || !(url.hostname === 'gumlet.io' || url.hostname.endsWith('.gumlet.io'))) throw new Error('Invalid Gumlet media URL');
  return url.href;
}

function selectAudioStream(manifest, playbackUrl) {
  const parser = new Parser();
  parser.push(manifest);
  parser.end();
  const tracks = Object.values(parser.manifest.mediaGroups?.AUDIO || {}).flatMap(group => Object.values(group)).filter(track => track.uri);
  const track = tracks.find(item => item.default) || tracks[0];
  if (track) return gumletUrl(track.uri, playbackUrl);
  const audioVariant = parser.manifest.playlists?.find(item => {
    const codecs = item.attributes?.CODECS || '';
    return /mp4a|aac|opus/i.test(codecs) && !/avc|hvc|hev|vp0|av01/i.test(codecs) && !item.attributes?.RESOLUTION;
  });
  if (audioVariant) return gumletUrl(audioVariant.uri, playbackUrl);
  throw new Error('This Gumlet asset has no separate audio stream');
}

async function getGumletAudioAsset(assetId) {
  const asset = await getGumletAsset(assetId);
  if (asset.status !== 'ready' || !asset.output?.playback_url) throw new Error('Audio is still processing in Gumlet');
  const playbackUrl = gumletUrl(asset.output.playback_url);
  // Native audio-only assets can use the complete manifest; videos need their audio rendition.
  if (asset.input?.transformations?.audio_only === true ||
      (asset.output.storage_details?.audio?.length && !asset.output.storage_details?.video?.length)) return asset;
  let manifest;
  try {
    const response = await axios.get(playbackUrl, { timeout: 15000, maxRedirects: 0, maxContentLength: 1024 * 1024, responseType: 'text' });
    manifest = response.data;
  } catch { throw new Error('Gumlet audio is temporarily unavailable'); }
  return { ...asset, output: { ...asset.output, playback_url: selectAudioStream(manifest, playbackUrl) } };
}

async function getGumletAsset(assetId) {
  if (!/^[a-f0-9]{24}$/i.test(assetId || '')) throw new Error('Invalid Gumlet asset ID');
  if (!process.env.GUMLET_API_KEY) throw new Error('Gumlet API key is not configured');
  try {
    const response = await axios.get(`https://api.gumlet.com/v1/video/assets/${assetId}`, {
      headers: { Authorization: `Bearer ${process.env.GUMLET_API_KEY}`, accept: 'application/json' },
      timeout: 25000
    });
    return response.data;
  } catch (error) {
    // Axios errors include request headers; never pass those to API responses/logs.
    const status = error.response?.status;
    throw new Error(status === 401 || status === 403
      ? 'Gumlet credentials cannot access this asset. Check the workspace API key.'
      : 'Video streaming temporarily unavailable');
  }
}

module.exports = { getGumletAsset, getGumletAudioAsset, selectAudioStream };
