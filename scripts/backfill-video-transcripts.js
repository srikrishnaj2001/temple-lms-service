#!/usr/bin/env node
'use strict';

/**
 * Backfill script — populate `videos.transcript` for every row that has an
 * externalVideoId but no (or very short) transcript yet.
 *
 * Pulls the transcript from Gumlet (same path used by the new forward
 * auto-trigger in POST/PUT /videos) and writes it back to the Video row.
 * Once the row is populated, the lms-rag LMS-content cron picks it up on
 * the next tick and re-chunks + re-embeds with real content.
 *
 * Usage (from lms-service/):
 *   node scripts/backfill-video-transcripts.js            # process every video
 *   node scripts/backfill-video-transcripts.js --dry-run  # print what would change, no writes
 *   node scripts/backfill-video-transcripts.js --force    # re-fetch even rows that already have transcript
 *   node scripts/backfill-video-transcripts.js --limit 20 # cap how many to process
 *   node scripts/backfill-video-transcripts.js --id 42    # single video by id (useful for retry)
 *
 * Idempotent: the service's own skip-if-populated guard means re-runs are
 * cheap. Fail-safe: per-row errors log and continue — one broken Gumlet
 * asset doesn't stop the batch.
 */

require('dotenv').config();
const { Op } = require('sequelize');
const { Video, sequelize } = require('../models');
const transcriptService = require('../src/services/gumletTranscriptService');

const SLEEP_MS_BETWEEN_FETCHES = 250; // easy on Gumlet's rate limit

function parseArgs(argv) {
  const args = { dryRun: false, force: false, limit: null, id: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--force') args.force = true;
    else if (a === '--limit') args.limit = parseInt(argv[++i], 10);
    else if (a === '--id') args.id = parseInt(argv[++i], 10);
  }
  return args;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const args = parseArgs(process.argv);

  const where = {
    externalVideoId: { [Op.ne]: null },
  };
  if (args.id) where.id = args.id;
  else if (!args.force) {
    where[Op.or] = [
      { transcript: null },
      { transcript: '' },
      sequelize.literal('LENGTH("transcript") < 100'),
    ];
  }

  const videos = await Video.findAll({
    where,
    attributes: ['id', 'title', 'externalVideoId', 'transcript'],
    order: [['id', 'ASC']],
    limit: args.limit || undefined,
  });

  console.log(
    `[backfill] found ${videos.length} videos needing transcripts ` +
    `(dryRun=${args.dryRun} force=${args.force} limit=${args.limit ?? '∞'})`,
  );

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  for (const v of videos) {
    if (args.dryRun) {
      console.log(`  [DRY] video ${v.id} "${v.title?.slice(0, 60)}" → would fetch from ${v.externalVideoId}`);
      continue;
    }
    try {
      const text = await transcriptService.fetchTranscriptText(v.externalVideoId);
      if (!text) {
        console.log(`  [skip] video ${v.id} — Gumlet has no transcript yet for ${v.externalVideoId}`);
        skipped++;
      } else {
        await Video.update({ transcript: text }, { where: { id: v.id } });
        console.log(`  [ok]   video ${v.id} ✓ ${text.length} chars`);
        ok++;
      }
    } catch (err) {
      console.warn(`  [fail] video ${v.id}: ${err.message}`);
      failed++;
    }
    await sleep(SLEEP_MS_BETWEEN_FETCHES);
  }

  console.log(`\n[backfill] done — ok=${ok} skipped=${skipped} failed=${failed} total=${videos.length}`);
  await sequelize.close();
  process.exit(failed > 0 && ok === 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('[backfill] fatal:', err);
  try { await sequelize.close(); } catch {}
  process.exit(1);
});
