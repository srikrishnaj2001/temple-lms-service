#!/usr/bin/env node
'use strict';

/**
 * Backfill script — populate `resources.extracted_text` for every PDF
 * resource that was uploaded before the auto-extract wiring was added.
 *
 * Fetches each PDF from its R2 URL, runs it through pdf-parse, and writes
 * the text back to the Resource row. Once the row is populated, the
 * lms-rag LMS-content cron picks it up on the next tick and re-chunks +
 * re-embeds with the real PDF body.
 *
 * Uses pdfExtractService directly rather than extractInBackground so this
 * script can report completion / failures synchronously. The service's
 * own idempotency check still applies when --force is not set.
 *
 * Usage (from lms-service/):
 *   node scripts/backfill-pdf-extracts.js             # process every PDF
 *   node scripts/backfill-pdf-extracts.js --dry-run   # list what would change, no writes
 *   node scripts/backfill-pdf-extracts.js --force     # re-extract even rows that already have text
 *   node scripts/backfill-pdf-extracts.js --limit 20  # cap how many to process
 *   node scripts/backfill-pdf-extracts.js --id 42     # single resource by id (useful for retry)
 */

require('dotenv').config();
const { Op } = require('sequelize');
const { Resource, sequelize } = require('../models');
const pdfExtractService = require('../src/services/pdfExtractService');

const SLEEP_MS_BETWEEN_FETCHES = 200; // small R2 breather

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

async function fetchBuffer(url) {
  // pdfExtractService exports extractFromBuffer; we inline the HTTP fetch
  // here (also in pdfExtractService.fetchPdfBuffer, which is not exported)
  // so this script can report per-row timings without hacking in a
  // setImmediate wrapper.
  const axios = require('axios');
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30_000,
    maxContentLength: 50 * 1024 * 1024,
    maxBodyLength: 50 * 1024 * 1024,
  });
  return Buffer.from(response.data);
}

async function main() {
  const args = parseArgs(process.argv);

  const where = { type: 'PDF', url: { [Op.ne]: null } };
  if (args.id) where.id = args.id;
  else if (!args.force) {
    where[Op.or] = [
      { extractedText: null },
      { extractedText: '' },
      sequelize.literal('LENGTH("extracted_text") < 100'),
    ];
  }

  const resources = await Resource.findAll({
    where,
    attributes: ['id', 'title', 'url', 'extractedText'],
    order: [['id', 'ASC']],
    limit: args.limit || undefined,
  });

  console.log(
    `[backfill] found ${resources.length} PDF resources needing extraction ` +
    `(dryRun=${args.dryRun} force=${args.force} limit=${args.limit ?? '∞'})`,
  );

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  for (const r of resources) {
    if (args.dryRun) {
      console.log(`  [DRY] resource ${r.id} "${r.title?.slice(0, 60)}" → would fetch ${r.url}`);
      continue;
    }
    try {
      if (!/^https?:\/\//i.test(r.url || '')) {
        console.log(`  [skip] resource ${r.id} — not an http(s) url`);
        skipped++;
        continue;
      }
      const started = Date.now();
      const buffer = await fetchBuffer(r.url);
      const text = await pdfExtractService.extractFromBuffer(buffer);
      if (!text || text.length < 50) {
        console.warn(`  [skip] resource ${r.id} — extracted text ${text?.length ?? 0} chars (likely scanned/image PDF)`);
        skipped++;
      } else {
        await Resource.update({ extractedText: text }, { where: { id: r.id } });
        console.log(`  [ok]   resource ${r.id} ✓ ${text.length} chars in ${Date.now() - started}ms`);
        ok++;
      }
    } catch (err) {
      console.warn(`  [fail] resource ${r.id}: ${err.message}`);
      failed++;
    }
    await sleep(SLEEP_MS_BETWEEN_FETCHES);
  }

  console.log(`\n[backfill] done — ok=${ok} skipped=${skipped} failed=${failed} total=${resources.length}`);
  await sequelize.close();
  process.exit(failed > 0 && ok === 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('[backfill] fatal:', err);
  try { await sequelize.close(); } catch {}
  process.exit(1);
});
