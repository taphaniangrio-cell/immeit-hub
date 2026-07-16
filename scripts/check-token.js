const fs = require('fs');
const path = require('path');

function initEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const i = t.indexOf('=');
    if (i < 1) return;
    const key = t.slice(0, i).trim();
    const val = t.slice(i + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  });
}

initEnv();

if (!process.env.DATABASE_URL) {
  console.error('  ❌ DATABASE_URL n\'est pas configuré.');
  process.exit(1);
}

const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    const r = await client.query(
      'SELECT cache_data FROM dashboard_cache WHERE cache_key = $1',
      ['msal_token_cache']
    );
    if (!r.rows.length) {
      console.log('  ⚠ Aucun cache MSAL trouvé en base.');
      process.exit(0);
    }

    const d = r.rows[0].cache_data;
    const blob = typeof d === 'string' ? JSON.parse(d) : d;
    const inner = JSON.parse(blob.blob);
    console.log('  Expire le :', new Date(inner.expiresAt).toISOString());
    console.log('  Refresh token présent :', !!inner.refreshToken);
    console.log('  Maintenant :', new Date().toISOString());
    process.exit(0);
  } catch (e) {
    console.error('  ❌', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
