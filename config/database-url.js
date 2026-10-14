'use strict';

// Supabase's session pool reserves a server connection for every idle client.
// Use its transaction endpoint for the stateless API so overlapping Render
// deployments do not exhaust the session pool. RAG retains its own URL.
function apiDatabaseUrl(value, environment) {
  if (environment !== 'production' || !value) return value;
  const url = new URL(value);
  if (url.hostname.endsWith('.pooler.supabase.com') && url.port === '5432') {
    url.port = '6543';
    return url.toString();
  }
  return value;
}

module.exports = { apiDatabaseUrl };
