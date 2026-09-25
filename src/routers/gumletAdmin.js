'use strict';
const router = require('express').Router();
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const { getGumletAsset } = require('../utils/gumlet-assets');
const client = () => {
  if (!process.env.GUMLET_API_KEY || !process.env.GUMLET_COLLECTION_ID) throw new Error('Gumlet API key and workspace must be configured on the server.');
  return axios.create({ baseURL: 'https://api.gumlet.com/v1/video', timeout: 30000, headers: { Authorization: `Bearer ${process.env.GUMLET_API_KEY}` } });
};
const safeUrl = value => typeof value === 'string' && value.startsWith('https://') ? value : null;
function present(asset) {
  const thumbnails = asset.output?.thumbnail_url || asset.thumbnail_url;
  return { id: asset.asset_id, title: asset.title || asset.input?.title || asset.asset_id, status: asset.status,
    error: typeof asset.error?.message === 'string' ? asset.error.message : null,
    durationMs: Math.round(Number(asset.input?.duration ?? asset.output?.duration ?? asset.duration ?? 0) * 1000),
    thumbnailUrl: safeUrl(Array.isArray(thumbnails) ? thumbnails[0] : thumbnails),
    playbackUrl: safeUrl(asset.output?.playback_url),
  };
}
const run = handler => async (req, res) => {
  try { res.json({ success: true, data: await handler(req) }); }
  catch (error) {
    const status = error.response?.status;
    res.status(status === 429 ? 429 : 400).json({ success: false, error: error.isAxiosError ? `Gumlet request failed (${status || 'network error'}). Check workspace access and quota.` : error.message });
  }
};
router.get('/assets', run(async req => {
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const { data } = await client().get(`/workspaces/${process.env.GUMLET_COLLECTION_ID}/list`, { params: { type: 'videos', size: 50, offset, ...(req.query.q && { title: String(req.query.q).slice(0, 200) }) } });
  return { assets: (data.all_assets || data.assets || []).map(present), total: data.total_count ?? data.asset_count ?? 0, offset };
}));
router.get('/assets/:id', run(async req => {
  const asset = await getGumletAsset(req.params.id);
  const workspace = asset.collection_id || asset.source_id || asset.input?.collection_id;
  if (workspace && workspace !== process.env.GUMLET_COLLECTION_ID) throw new Error('Asset is outside the configured workspace.');
  return present(asset);
}));
router.post('/uploads', rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }), run(async req => {
  const { title, size, mimeType } = req.body;
  if (!title?.trim() || title.length > 255) throw new Error('Enter a title up to 255 characters.');
  if (!Number.isInteger(size) || size <= 0 || size > 2 * 1024 ** 3) throw new Error('Choose a file up to 2 GB.');
  if (!['video/mp4', 'video/webm', 'video/quicktime', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/ogg'].includes(mimeType)) throw new Error('Unsupported media type.');
  const { data } = await client().post('/assets/upload', { collection_id: process.env.GUMLET_COLLECTION_ID, format: 'ABR', audio_only: mimeType.startsWith('audio/'), title: title.trim(), tag: ['templelms-admin'] });
  const url = new URL(data.upload_url);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.amazonaws.com') || !data.asset_id) throw new Error('Unexpected Gumlet upload response.');
  return { id: data.asset_id, uploadUrl: url.href, status: data.status };
}));
module.exports = router;
