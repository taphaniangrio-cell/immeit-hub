const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
fs.readFileSync(envPath, 'utf8').split('\n').forEach(l => {
  const t = l.trim();
  if (!t || t.startsWith('#')) return;
  const i = t.indexOf('=');
  if (i < 1) return;
  if (!process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
});
const db = require('../lib/db');
db.query('SELECT cache_data FROM dashboard_cache WHERE cache_key = $1', ['msal_token_cache'])
  .then(r => {
    const d = r.rows[0].cache_data;
    const blob = typeof d === 'string' ? JSON.parse(d) : d;
    const inner = JSON.parse(blob.blob);
    console.log('Expires:', new Date(inner.expiresAt).toISOString());
    console.log('Has refresh token:', !!inner.refreshToken);
    console.log('Now:', new Date().toISOString());
    process.exit(0);
  })
  .catch(e => { console.error(e.message); process.exit(1); });
