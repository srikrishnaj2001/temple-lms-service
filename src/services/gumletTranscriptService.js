'use strict';

const { Video } = require('../../models');
const { getGumletAsset } = require('../utils/gumlet-assets');
const summaryService = require('./summaryService');

/**
 * Gumlet transcript persistence service.
 *
 * Mirrors pdfExtractService.js — fetches a transcript from Gumlet's
 * `transcription_word_level_timestamps` output and saves the plain-text
 * form to `videos.transcript` so the RAG ingest cron can chunk + embed it.
 *
 * Why this exists: Gumlet owns the subtitle generation, but without the
 * transcript column in our own DB, the lms-rag LMS-content cron ingests
 * only `title + description` for every video — 180-char chunks with no
 * usable retrieval signal. Writing the transcript locally lets the cron
 * see real content and produce real chunks (~425 tokens each).
 *
 * Design notes:
 *   - Called in the background (setImmediate) from the video create/update
 *     routes — admin doesn't wait for Gumlet.
 *   - Idempotent — skips if transcript is already populated AND
 *     options.force is false (admin re-upload or re-save shouldn't
 *     re-fetch unnecessarily).
 *   - Fail-silent — a failed fetch leaves the column null; subsequent
 *     cron runs (or the backfill script) can retry. Logs for observability.
 *   - Reads from Gumlet directly each call rather than relying on an
 *     in-memory cache — the API is cheap and we don't want stale fetches.
 */

const MIN_USEFUL_CHARS = 100;

/**
 * Fetch a Gumlet transcription as plain text. Returns null when the asset
 * has no transcription yet (Gumlet is still processing), or the result is
 * too short to be useful. Does not throw.
 *
 * @param {string} externalAssetId - Gumlet asset id (what's stored in
 *   Video.externalVideoId / Audio.externalAudioId).
 * @returns {Promise<string|null>}
 */
async function fetchTranscriptText(externalAssetId) {
  if (!externalAssetId) return null;
  try {
    const asset = await getGumletAsset(externalAssetId);
    const url = asset?.output?.transcription_word_level_timestamps;
    if (!url) return null;
    const data = await summaryService.fetchTranscription(url);
    const text = summaryService.convertTranscriptionToText(data);
    return text && text.length >= MIN_USEFUL_CHARS ? text : null;
  } catch (err) {
    console.warn(`[GumletTranscript] fetch failed for asset ${externalAssetId}: ${err.message}`);
    return null;
  }
}

/**
 * Fire-and-forget: pull the Gumlet transcript for `videoId` (whose
 * `externalVideoId` points at the Gumlet asset) and persist it to
 * `videos.transcript`. Does not throw. Caller returns to the admin
 * immediately; transcript appears a few seconds later.
 *
 * Only runs when:
 *   - The video row exists
 *   - externalVideoId is set
 *   - videos.transcript is empty / shorter than MIN_USEFUL_CHARS
 *     (unless options.force is true)
 *
 * @param {number} videoId - Local videos.id
 * @param {object} [options]
 * @param {boolean} [options.force] - Re-fetch even if transcript already set.
 */
function fetchInBackground(videoId, options = {}) {
  setImmediate(async () => {
    try {
      const existing = await Video.findByPk(videoId, {
        attributes: ['id', 'externalVideoId', 'transcript'],
      });
      if (!existing) return;
      if (!existing.externalVideoId) {
        console.log(`[GumletTranscript] video ${videoId} skipped — no externalVideoId`);
        return;
      }
      if (
        !options.force &&
        existing.transcript &&
        existing.transcript.length >= MIN_USEFUL_CHARS
      ) {
        console.log(`[GumletTranscript] video ${videoId} already has transcript — skipping`);
        return;
      }

      const started = Date.now();
      const text = await fetchTranscriptText(existing.externalVideoId);
      if (!text) {
        // Gumlet hasn't finished transcribing yet, or it's an audio-less
        // video. The next admin save (or a backfill run) will retry.
        console.log(
          `[GumletTranscript] video ${videoId} — no transcript available yet from Gumlet (${Date.now() - started}ms)`,
        );
        return;
      }
      await Video.update({ transcript: text }, { where: { id: videoId } });
      console.log(
        `[GumletTranscript] video ${videoId} ✓ ${text.length} chars in ${Date.now() - started}ms`,
      );
    } catch (err) {
      console.warn(`[GumletTranscript] video ${videoId} failed: ${err.message}`);
    }
  });
}

module.exports = {
  fetchInBackground,
  fetchTranscriptText,
  MIN_USEFUL_CHARS,
};
