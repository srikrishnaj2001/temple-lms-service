const fs = require('node:fs');
const path = require('node:path');
const axios = require('axios');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const root = path.resolve(__dirname, '../..');
const directory = path.join(root, '.local-media/iskcon-bangalore');
const statePath = path.join(directory, 'gumlet-upload-state.json');
const apiBase = 'https://api.gumlet.com/v1/video/assets';

function save(state) {
  const temporary = `${statePath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, statePath);
}

async function main() {
  const mode = process.argv[2];
  if (!['--plan', '--upload', '--status'].includes(mode)) {
    throw new Error('Usage: node scripts/upload-iskcon-seed-videos.js --plan|--upload|--status [--collection=ID] [--budget-minutes=N]');
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  if (manifest.videos.length < 30) throw new Error('At least 30 source videos are required.');
  const budgetArg = process.argv.find(arg => arg.startsWith('--budget-minutes='));
  const budgetMinutes = budgetArg ? Number(budgetArg.split('=')[1]) : Infinity;
  if (budgetArg && (!Number.isFinite(budgetMinutes) || budgetMinutes <= 0)) throw new Error('Invalid storage budget.');
  let seconds = 0;
  const selected = (budgetArg ? [...manifest.videos].sort((a, b) => a.durationSeconds - b.durationSeconds) : manifest.videos).filter(item => {
    if (!Number.isFinite(item.durationSeconds) || item.durationSeconds <= 0) throw new Error('Invalid source duration.');
    if (seconds + Math.ceil(item.durationSeconds) > budgetMinutes * 60) return false;
    seconds += Math.ceil(item.durationSeconds);
    return true;
  });
  if (!selected.length) throw new Error('No videos fit the storage budget.');
  for (const item of selected) {
    if (!/^[\w-]{11}$/.test(item.youtubeId) || item.file !== `${item.youtubeId}.mp4`) {
      throw new Error('Invalid source manifest filename.');
    }
    const file = path.join(directory, item.file);
    if (item.status !== 'downloaded' || !fs.existsSync(file) || fs.statSync(file).size !== item.bytes) {
      throw new Error(`Run the download verification first: ${item.youtubeId}`);
    }
  }
  console.log(`${selected.length} videos, ${(seconds / 60).toFixed(2)} minutes, ${Math.round(selected.reduce((n, v) => n + v.bytes, 0) / 1048576)} MB`);
  if (mode === '--plan') return;

  const collectionId = process.argv.find(arg => arg.startsWith('--collection='))?.split('=')[1];
  if (!collectionId || collectionId !== process.env.GUMLET_COLLECTION_ID) {
    throw new Error('Pass --collection=ID matching the confirmed GUMLET_COLLECTION_ID in the service environment.');
  }
  if (!process.env.GUMLET_API_KEY) throw new Error('GUMLET_API_KEY is missing.');
  const state = fs.existsSync(statePath)
    ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
    : { schemaVersion: 1, collectionId, assets: {} };
  if (state.collectionId !== collectionId) throw new Error('This batch belongs to a different Gumlet workspace.');
  const selectedIds = selected.map(item => item.youtubeId);
  if (state.selectedIds && JSON.stringify(state.selectedIds) !== JSON.stringify(selectedIds)) {
    throw new Error('The saved batch uses a different selection. Reuse the original budget.');
  }
  state.selectedIds = selectedIds;
  const client = axios.create({
    baseURL: apiBase, timeout: 30000,
    headers: { Authorization: `Bearer ${process.env.GUMLET_API_KEY}`, Accept: 'application/json' },
  });

  for (const item of selected) {
    let entry = state.assets[item.youtubeId];
    if (!entry && mode === '--status') {
      console.log(`${item.youtubeId}: not uploaded`);
      continue;
    }
    if (!entry) {
      // Save intent before the POST: an ambiguous response must not create duplicates on retry.
      entry = state.assets[item.youtubeId] = { status: 'create-requested' };
      save(state);
      const { data } = await client.post('/upload', {
        collection_id: collectionId, format: 'ABR', title: item.title,
        description: `Authorized TempleLMS seed video. Source: ${item.sourceUrl}`,
        tag: ['templelms-seed'],
        metadata: { youtubeId: item.youtubeId, sourceUrl: item.sourceUrl },
      });
      if (!data.asset_id || !data.upload_url) throw new Error('Gumlet did not return an asset ID and upload URL.');
      Object.assign(entry, { assetId: data.asset_id, uploadUrl: data.upload_url, status: 'upload-pending' });
      save(state);
    }
    if (!entry.assetId) {
      throw new Error(`Creation outcome for ${item.youtubeId} is uncertain. Reconcile in Gumlet before retrying.`);
    }
    if (!/^[a-f0-9]{24}$/i.test(entry.assetId)) throw new Error('Invalid Gumlet asset ID.');
    const { data: before } = await client.get(`/${entry.assetId}`);
    entry.status = before.status;
    save(state);
    if (entry.status === 'upload-pending' && mode === '--upload') {
      if (!entry.uploadUrl) throw new Error('Upload URL missing. Reconcile this asset in Gumlet.');
      const destination = new URL(entry.uploadUrl);
      if (destination.protocol !== 'https:' || !destination.hostname.endsWith('.amazonaws.com')) {
        throw new Error('Unexpected upload destination. Check Gumlet documentation before continuing.');
      }
      console.log(`Uploading: ${item.title}`);
      await axios.put(entry.uploadUrl, fs.createReadStream(path.join(directory, item.file)), {
        headers: { 'Content-Type': 'video/mp4', 'Content-Length': item.bytes },
        maxBodyLength: Infinity, maxContentLength: Infinity,
        maxRedirects: 0, timeout: 30 * 60 * 1000,
      });
      delete entry.uploadUrl;
      entry.status = 'uploaded';
      save(state);
    }
    const { data: asset } = await client.get(`/${entry.assetId}`);
    entry.status = asset.status;
    entry.playbackUrl = asset.output?.playback_url || null;
    if (entry.status !== 'upload-pending') delete entry.uploadUrl;
    save(state);
    console.log(`${item.youtubeId}: ${entry.status}`);
  }
  const ready = selected.filter(item => {
    const entry = state.assets[item.youtubeId];
    return entry?.status === 'ready' && entry.playbackUrl;
  });
  console.log(`${ready.length}/${selected.length} assets ready. Run --status again after processing.`);
  if (ready.length === selected.length) {
    for (const item of selected) item.gumletAssetId = state.assets[item.youtubeId].assetId;
    const manifestPath = path.join(directory, 'manifest.json');
    fs.writeFileSync(`${manifestPath}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`);
    fs.renameSync(`${manifestPath}.tmp`, manifestPath);
    const catalog = {
      schemaVersion: 1, channelUrl: manifest.channelUrl,
      videos: manifest.videos.map(item => ({
        youtubeId: item.youtubeId, title: item.title, sourceUrl: item.sourceUrl,
        durationMs: Math.round(item.durationSeconds * 1000), width: item.width, height: item.height,
        gumletAssetId: item.gumletAssetId || null,
      })),
    };
    fs.writeFileSync(path.join(root, 'lms-service/seed-data/iskcon-video-sources.json'), `${JSON.stringify(catalog, null, 2)}\n`);
    console.log('Catalog populated with explicit Gumlet IDs. No database records were changed.');
  }
}

main().catch(error => {
  // Axios errors contain credentials and signed URLs in their config; never dump the error object.
  console.error(error.message);
  process.exitCode = 1;
});
