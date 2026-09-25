const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const directory = path.join(root, '.local-media/iskcon-bangalore');
const manifestPath = path.join(directory, 'manifest.json');
const downloader = path.join(root, '.tools/video-import/bin/yt-dlp');
const channelUrl = 'https://www.youtube.com/@iskconbangalore/videos';
const targetCount = 30;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${path.basename(command)} failed (${result.status}). ${result.stderr || ''}`);
  }
  return result.stdout;
}

function save(manifest) {
  manifest.updatedAt = new Date().toISOString();
  const temporary = `${manifestPath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.renameSync(temporary, manifestPath);
}

function inspect(file) {
  const probe = JSON.parse(run('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height',
    '-of', 'json', file,
  ]));
  const video = probe.streams.find(stream => stream.codec_type === 'video');
  const audio = probe.streams.find(stream => stream.codec_type === 'audio');
  const durationSeconds = Number(probe.format.duration);
  if (!video || !audio || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error(`Missing video/audio or invalid duration: ${file}`);
  }
  if (video.height > 720) throw new Error(`Video exceeds 720p: ${file}`);
  return {
    durationSeconds, width: video.width, height: video.height,
    bytes: fs.statSync(file).size,
  };
}

function main() {
  const mode = process.argv[2];
  if (!['--list', '--download', '--verify'].includes(mode)) {
    throw new Error('Usage: node scripts/download-iskcon-seed-videos.js --list|--download|--verify');
  }
  fs.mkdirSync(directory, { recursive: true });
  let manifest;
  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } else {
    if (mode === '--verify') throw new Error('No manifest yet. Run --list first.');
    const playlist = JSON.parse(run(downloader, [
      '--ignore-config', '--flat-playlist', '--playlist-end', '60',
      '--socket-timeout', '30', '--retries', '2', '--dump-single-json', channelUrl,
    ], { timeout: 180000 }));
    const seen = new Set();
    const candidates = (playlist.entries || []).filter(entry => {
      if (!/^[\w-]{11}$/.test(entry.id) || seen.has(entry.id)) return false;
      seen.add(entry.id);
      return !['is_live', 'is_upcoming'].includes(entry.live_status)
        && entry.duration > 0 && entry.duration <= 1800;
    }).slice(0, targetCount);
    if (candidates.length < targetCount) {
      throw new Error(`Only ${candidates.length} eligible videos found; expected ${targetCount}.`);
    }
    manifest = {
      schemaVersion: 1, channelUrl, targetCount,
      permission: 'User confirmed permission to download and re-host this channel in the task.',
      videos: candidates.map(entry => ({
        youtubeId: entry.id, title: entry.title,
        sourceUrl: `https://www.youtube.com/watch?v=${entry.id}`,
        durationSeconds: entry.duration,
        file: `${entry.id}.mp4`, status: 'pending', gumletAssetId: null,
      })),
    };
    save(manifest);
  }

  if (mode === '--list') {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }
  for (const [index, item] of manifest.videos.entries()) {
    if (!/^[\w-]{11}$/.test(item.youtubeId) || item.file !== `${item.youtubeId}.mp4`) {
      throw new Error('Invalid manifest video ID or filename.');
    }
    const file = path.join(directory, item.file);
    console.log(`[${index + 1}/${manifest.videos.length}] ${item.title}`);
    if (!fs.existsSync(file) && mode === '--download') {
      // No browser cookies, account credentials, DRM workarounds, or remote plugins.
      run(downloader, [
        '--ignore-config', '--no-playlist', '--no-overwrites', '--continue',
        '--socket-timeout', '30', '--retries', '2', '--fragment-retries', '2',
        '--sleep-interval', '3', '--max-sleep-interval', '6',
        '--js-runtimes', 'node',
        '-f', 'bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]',
        '--merge-output-format', 'mp4', '--no-progress',
        '-o', file, `https://www.youtube.com/watch?v=${item.youtubeId}`,
      ], { stdio: 'inherit' });
    }
    const metadata = inspect(file);
    Object.assign(item, metadata, { status: 'downloaded' });
    save(manifest);
    console.log(`Verified ${metadata.width}x${metadata.height}, ${Math.round(metadata.bytes / 1048576)} MB`);
  }
  const count = manifest.videos.filter(video => video.status === 'downloaded').length;
  if (count < targetCount) throw new Error(`Only ${count}/${targetCount} downloads verified.`);
  const seedDirectory = path.join(root, 'lms-service/seed-data');
  fs.mkdirSync(seedDirectory, { recursive: true });
  fs.writeFileSync(path.join(seedDirectory, 'iskcon-video-sources.json'), `${JSON.stringify({
    schemaVersion: 1, channelUrl,
    videos: manifest.videos.map(({ youtubeId, title, sourceUrl, durationSeconds, width, height, gumletAssetId }) => ({
      youtubeId, title, sourceUrl, durationMs: Math.round(durationSeconds * 1000),
      width, height, gumletAssetId,
    })),
  }, null, 2)}\n`);
  console.log(`${count} verified files ready. Manifest: ${manifestPath}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
