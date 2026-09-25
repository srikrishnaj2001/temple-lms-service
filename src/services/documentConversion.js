'use strict';

const path = require('node:path');
const DOCUMENT_TYPES = {
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/rtf': 'rtf',
  'text/rtf': 'rtf',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};
const MAX_DOCUMENT_SIZE = 20 * 1024 * 1024;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

async function convertDocument(buffer, originalName, mimeType, fetcher = fetch) {
  const extension = path.extname(originalName).slice(1).toLowerCase();
  const expected = DOCUMENT_TYPES[mimeType];
  if (!expected || expected !== extension) throw fail('Use a PDF, Word, OpenDocument, RTF, TXT, PowerPoint, or Excel file with a matching extension.');
  if (!buffer.length || buffer.length > MAX_DOCUMENT_SIZE) throw fail('Documents must be between 1 byte and 20 MB.');
  if (expected === 'pdf') {
    if (buffer.subarray(0, 5).toString() !== '%PDF-') throw fail('The file is not a valid PDF.');
    return buffer;
  }
  const endpoint = process.env.DOCUMENT_CONVERTER_URL;
  if (!endpoint) throw fail('Document conversion is not configured. Upload a PDF or image instead.', 503);
  const body = new FormData();
  body.append('files', new Blob([buffer], { type: mimeType }), `lesson.${extension}`);
  try {
    const response = await fetcher(`${endpoint.replace(/\/+$/, '')}/forms/libreoffice/convert`, {
      method: 'POST', body, signal: AbortSignal.timeout(45000), redirect: 'error',
    });
    if (!response.ok) throw fail('This document could not be converted. Check that it is not damaged or password-protected.', 422);
    // Bound the output as well as the input, including chunked responses.
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > MAX_DOCUMENT_SIZE) throw fail('The converted PDF exceeds 20 MB.', 422);
      chunks.push(Buffer.from(chunk));
    }
    const pdf = Buffer.concat(chunks);
    if (pdf.subarray(0, 5).toString() !== '%PDF-') throw fail('The converter did not return a valid PDF.', 502);
    return pdf;
  } catch (error) {
    if (error.status) throw error;
    throw fail('Document conversion is temporarily unavailable. Please retry or upload a PDF.', 503);
  }
}

module.exports = { convertDocument, DOCUMENT_TYPES, MAX_DOCUMENT_SIZE };
