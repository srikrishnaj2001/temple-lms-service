'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { convertDocument, MAX_DOCUMENT_SIZE } = require('../src/services/documentConversion');

test('PDF input is preserved without a converter', async () => {
  const pdf = Buffer.from('%PDF-1.7\nexample');
  assert.equal(await convertDocument(pdf, 'lesson.pdf', 'application/pdf'), pdf);
});
test('invalid PDF, mismatched extensions, empty and oversized inputs are rejected', async () => {
  for (const [buffer, name, mime] of [
    [Buffer.from('not a pdf'), 'file.pdf', 'application/pdf'],
    [Buffer.from('hello'), 'file.exe', 'text/plain'],
    [Buffer.alloc(0), 'file.txt', 'text/plain'],
    [Buffer.alloc(MAX_DOCUMENT_SIZE + 1), 'file.txt', 'text/plain'],
  ]) await assert.rejects(convertDocument(buffer, name, mime), { status: 400 });
});
test('documents convert to PDF; failure never returns original document bytes', async () => {
  const old = process.env.DOCUMENT_CONVERTER_URL;
  process.env.DOCUMENT_CONVERTER_URL = 'http://127.0.0.1:3010';
  try {
    const input = Buffer.from('Hare Krishna');
    const pdf = await convertDocument(input, 'notes.txt', 'text/plain', async (url, options) => {
      assert.equal(url, 'http://127.0.0.1:3010/forms/libreoffice/convert');
      assert.equal(options.body.get('files').name, 'lesson.txt');
      return new Response('%PDF-1.7\nconverted');
    });
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    await assert.rejects(convertDocument(input, 'notes.txt', 'text/plain', async () => new Response('bad', { status: 400 })), { status: 422 });
    await assert.rejects(convertDocument(input, 'notes.txt', 'text/plain', async () => new Response('not PDF')), { status: 502 });
    await assert.rejects(convertDocument(input, 'notes.txt', 'text/plain', async () => { throw new Error('offline'); }), { status: 503 });
    await assert.rejects(convertDocument(input, 'notes.txt', 'text/plain', async () => new Response(Buffer.alloc(MAX_DOCUMENT_SIZE + 1))), { status: 422 });
    delete process.env.DOCUMENT_CONVERTER_URL;
    await assert.rejects(convertDocument(input, 'notes.txt', 'text/plain'), { status: 503 });
  } finally {
    if (old === undefined) delete process.env.DOCUMENT_CONVERTER_URL;
    else process.env.DOCUMENT_CONVERTER_URL = old;
  }
});
