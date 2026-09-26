'use strict';

// Render's free tier suspends the whole container after ~15 minutes with no
// inbound HTTP request — it doesn't matter that this process is otherwise
// alive and running a timer internally. So this must hit the service's own
// PUBLIC url (not localhost): that request leaves the container, goes
// through Render's edge, and comes back in as ordinary inbound traffic,
// which is what actually resets Render's idle clock. A schedule that only
// touched localhost would look "busy" to Node but invisible to Render, and
// the container would still get suspended on schedule.
//
// This only keeps itself warm as long as it never actually goes idle in the
// first place — if the process is ever suspended (e.g. a fresh deploy where
// the first tick hasn't fired yet, or an outage), nothing runs to wake it
// back up. An external pinger (e.g. a cron-job.org check, or Render's own
// paid "always on" tier) is the only thing that can recover from that; this
// is a same-process supplement, not a replacement.

const cron = require('node-cron');
const https = require('https');

const SELF_URL = process.env.SELF_URL || 'https://temple-lms-service.onrender.com/health';

function ping() {
  const req = https.get(SELF_URL, { timeout: 20000 }, (res) => {
    res.resume();
    console.log(`[keep-alive] ping ${SELF_URL} -> ${res.statusCode}`);
  });
  req.on('timeout', () => req.destroy(new Error('timeout')));
  req.on('error', (err) => console.error('[keep-alive] ping failed:', err.message));
}

function startKeepAlive() {
  if (process.env.NODE_ENV !== 'production' || process.env.KEEP_ALIVE_DISABLED === '1') return;
  cron.schedule('*/10 * * * *', ping);
  console.log(`[keep-alive] scheduled every 10 minutes, target ${SELF_URL}`);
}

module.exports = { startKeepAlive };
