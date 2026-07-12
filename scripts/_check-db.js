const fs = require('fs');
const env = {};
fs.readFileSync('.env', 'utf8').split('\n').forEach(l => {
  const i = l.indexOf('=');
  if (i > 0 && !l.startsWith('#')) {
    const k = l.slice(0, i).trim(), v = l.slice(i + 1).trim();
    if (!env[k]) env[k] = v;
  }
});
const { Pool } = require('pg');
const p = new Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const q = 'SELECT cache_key, pg_column_size(cache_data) as bytes FROM dashboard_cache';
p.query(q).then(r => {
  console.log(JSON.stringify(r.rows, null, 2));
  p.end();
}).catch(e => {
  console.error(e.message);
  p.end();
});
