'use strict';

const express = require('express');
const multer = require('multer');
const { uploadImage, uploadDocument, ALLOWED_TYPES, DOCUMENT_TYPES, MAX_FILE_SIZE } = require('../services/r2');
const { checkUserEmail } = require('../middlewares/authMiddleware');

const router = express.Router();
const documentUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 }, fileFilter: (_req, file, cb) => cb(DOCUMENT_TYPES[file.mimetype] ? null : new Error('Use PDF, DOC, DOCX, ODT, RTF, TXT, PPT, PPTX, XLS, or XLSX.'), !!DOCUMENT_TYPES[file.mimetype]) });
router.post('/document', documentUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file provided.' });
  try { res.status(201).json({ success: true, data: await uploadDocument(req.file.buffer, req.file.originalname, req.file.mimetype) }); }
  catch (error) { res.status(error.status || 502).json({ success: false, error: error.status ? error.message : 'File storage could not accept the upload. Check R2 credentials and bucket settings.' }); }
});

// Store files in memory (buffer) — they go straight to R2, no disk needed.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new Error(`File type "${file.mimetype}" is not allowed. Use JPEG, PNG, WebP, or GIF.`));
    }
  },
});

/**
 * POST /api/uploads/image
 * Accepts a single file under the field name "file".
 * Returns { success: true, data: { url, key } }
 */
router.post('/image', checkUserEmail, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided.' });
    }

    const { key, url } = await uploadImage(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    return res.status(201).json({
      success: true,
      data: { url, key },
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({
      success: false,
      error: error.status ? error.message : 'Image storage could not accept the upload. Check R2 credentials and bucket settings.',
    });
  }
});

// Multer error handler (file too large, wrong type, etc.)
router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, error: 'File exceeds the upload size limit.' });
    }
    return res.status(400).json({ success: false, error: err.message });
  }
  if (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
