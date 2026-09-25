'use strict';

const catalog = require('../../seed-data/gumlet-seed-assets.json');
const sources = require('../../seed-data/iskcon-video-sources.json');

function seedVideoForId(id) {
  if (!Number.isSafeInteger(id) || id < 0) throw new Error('Invalid seed video ID');
  const courseIndex = Math.floor(id / 100);
  const moduleIndex = Math.floor((id % 100) / 10);
  const asset = catalog.videos[(courseIndex * 2 + moduleIndex - 1 + catalog.videos.length) % catalog.videos.length];
  const source = sources.videos.find((video) => video.youtubeId === asset.youtubeId);
  if (!source) throw new Error(`Missing source metadata for ${asset.youtubeId}`);
  return {
    title: source.title,
    description: 'ISKCON Bangalore video. Reused across demo courses as sample learning content.',
    externalVideoId: asset.assetId,
    durationMs: Math.round(asset.duration * 1000),
    summary: null,
    transcript: null,
    externalResources: [{ title: 'Original video on ISKCON Bangalore', url: source.sourceUrl }]
  };
}

module.exports = { seedVideoForId };
