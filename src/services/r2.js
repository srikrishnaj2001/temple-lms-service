'use strict';

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');
const { convertDocument, DOCUMENT_TYPES } = require('./documentConversion');

const ALLOWED_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Upload a file buffer to Cloudflare R2.
 *
 * @param {Buffer} buffer      — raw file bytes
 * @param {string} originalName — e.g. "photo.png"
 * @param {string} mimeType    — e.g. "image/png"
 * @returns {{ key: string, url: string }}
 */
async function uploadImage(buffer, originalName, mimeType) {
  if (!ALLOWED_TYPES[mimeType]) {
    throw Object.assign(new Error(`File type "${mimeType}" is not allowed. Use JPEG, PNG, WebP, or GIF.`), { status: 400 });
  }
  if (buffer.length > MAX_FILE_SIZE) {
    throw Object.assign(new Error('File size exceeds 5 MB limit.'), { status: 400 });
  }

  return uploadFile(buffer, mimeType, ALLOWED_TYPES[mimeType], 'images');
}

async function uploadDocument(buffer, originalName, mimeType) {
  const pdf = await convertDocument(buffer, originalName, mimeType);
  return { ...await uploadFile(pdf, 'application/pdf', 'pdf', 'resources'), mimeType: 'application/pdf', converted: mimeType !== 'application/pdf' };
}

async function uploadFile(buffer, mimeType, ext, folder) {
  if (['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL'].some(key => !process.env[key])) throw Object.assign(new Error('File storage is not configured. You can still use a hosted URL.'), { status: 503 });
  const hash = crypto.randomBytes(12).toString('hex');
  const key = `${folder}/${hash}.${ext}`;

  await s3.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  const publicUrl = `${process.env.R2_PUBLIC_URL.replace(/\/+$/, '')}/${key}`;
  return { key, url: publicUrl };
}

module.exports = { uploadImage, uploadDocument, ALLOWED_TYPES, DOCUMENT_TYPES, MAX_FILE_SIZE };
