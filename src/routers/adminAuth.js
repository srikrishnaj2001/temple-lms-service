'use strict';
const crypto = require('node:crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const sessions = new Map();
const ttl = 8 * 60 * 60 * 1000;
const digest = value => crypto.createHash('sha256').update(String(value || '')).digest();
const equal = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));
const tokenOf = req => (req.get('authorization') || '').replace(/^Bearer /, '');

function requireAdmin(req, res, next) {
  const key = digest(tokenOf(req)).toString('hex');
  const session = sessions.get(key);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(key);
    return res.status(401).json({ success: false, error: 'Please sign in to admin again.' });
  }
  req.admin = session;
  req.headers['user-email'] = session.email;
  next();
}

router.post('/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false }), (req, res) => {
  const local = process.env.NODE_ENV !== 'production' && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  const email = process.env.ADMIN_EMAIL || (local ? 'admin@example.com' : '');
  const password = process.env.ADMIN_PASSWORD || (local ? 'templeadmin' : '');
  if (!email || !password) return res.status(503).json({ success: false, error: 'Admin credentials are not configured.' });
  if (!equal(req.body.email?.trim().toLowerCase(), email.toLowerCase()) || !equal(req.body.password, password)) {
    return res.status(401).json({ success: false, error: 'Invalid email or password.' });
  }
  for (const [key, value] of sessions) if (value.expiresAt <= Date.now()) sessions.delete(key);
  const token = crypto.randomBytes(32).toString('hex');
  const session = { email, expiresAt: Date.now() + ttl };
  sessions.set(digest(token).toString('hex'), session);
  res.set('Cache-Control', 'no-store').json({ success: true, data: { token, ...session } });
});
router.get('/session', requireAdmin, (req, res) => res.json({ success: true, data: req.admin }));
router.post('/logout', requireAdmin, (req, res) => {
  sessions.delete(digest(tokenOf(req)).toString('hex'));
  res.json({ success: true });
});
module.exports = { router, requireAdmin };
