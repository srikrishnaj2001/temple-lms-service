'use strict';

const axios = require('axios');
const pdfParse = require('pdf-parse');
const { Resource } = require('../../models');

/**
 * PDF text extraction service.
 *
 * Fetches a PDF from its R2 URL, runs it through `pdf-parse` to extract plain
 * text, and saves the result to `resources.extracted_text`. Used downstream by
 * quizService to build sharp LLM context for RESOURCE lessons.
 *
 * Design notes:
 *   - Called in the background (setImmediate) from the resource create/update
 *     route — admin doesn't wait for extraction.
 *   - Idempotent — if resource already has extracted_text, we skip to save
 *     API calls (admin can force a re-extract later if we add that UI).
 *   - Capped at 500K chars (~200 pages) to keep DB rows reasonable.
 *   - Fail-silent — a failed extraction leaves the column null; admin can
 *     fall back to typing a manual summary.
 *
 * Does NOT handle:
 *   - Scanned/image PDFs — pdf-parse returns empty text for those.
 *     Admin would need to OCR separately and paste text manually.
 *   - Password-protected PDFs — pdf-parse throws; we catch and log.
 */

const MAX_EXTRACTED_CHARS = 500_000;
const FETCH_TIMEOUT_MS = 30_000;
const MAX_PDF_BYTES = 50 * 1024 * 1024; // 50 MB upload cap for extraction

async function fetchPdfBuffer(url) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: FETCH_TIMEOUT_MS,
    maxContentLength: MAX_PDF_BYTES,
    maxBodyLength: MAX_PDF_BYTES,
  });
  return Buffer.from(response.data);
}

/**
 * Extract text from a PDF buffer.
 * @param {Buffer} buffer
 * @returns {Promise<string>}
 */
async function extractFromBuffer(buffer) {
  const result = await pdfParse(buffer);
  const text = (result?.text || '').trim();
  return text.slice(0, MAX_EXTRACTED_CHARS);
}

/**
 * Fire-and-forget: fetch the PDF at `url`, extract text, save to the resource.
 * Caller provides resourceId. Logs on success/failure, does not throw.
 *
 * Only runs when:
 *   - resource is type=PDF
 *   - url looks like an http(s) URL
 *   - resource doesn't already have extracted_text (skip to save on re-saves)
 */
function extractInBackground(resourceId, url, options = {}) {
  setImmediate(async () => {
    try {
      if (!url || !/^https?:\/\//i.test(url)) {
        console.log(`[PdfExtract] resource ${resourceId} skipped — no http(s) url`);
        return;
      }

      if (!options.force) {
        const existing = await Resource.findByPk(resourceId, {
          attributes: ['id', 'extractedText', 'type'],
        });
        if (!existing || existing.type !== 'PDF') return;
        if (existing.extractedText && existing.extractedText.length > 100) {
          console.log(`[PdfExtract] resource ${resourceId} already extracted — skipping`);
          return;
        }
      }

      const started = Date.now();
      const buffer = await fetchPdfBuffer(url);
      const text = await extractFromBuffer(buffer);

      if (!text || text.length < 50) {
        console.warn(`[PdfExtract] resource ${resourceId} — extracted text was too short (${text.length} chars). Possibly a scanned/image PDF.`);
        return;
      }

      await Resource.update(
        { extractedText: text },
        { where: { id: resourceId } },
      );
      console.log(`[PdfExtract] resource ${resourceId} ✓ ${text.length} chars in ${Date.now() - started}ms`);
    } catch (err) {
      console.warn(`[PdfExtract] resource ${resourceId} failed: ${err.message}`);
    }
  });
}

module.exports = {
  extractInBackground,
  extractFromBuffer, // exported for tests / future admin "re-extract" button
  MAX_EXTRACTED_CHARS,
};
