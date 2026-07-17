// scripts/check-token.js
//
// Vérifie l'état du cache MSAL en base PostgreSQL : date d'expiration du refresh token,
// présence du refresh token, et état physique de l'entrée.
//
// Usage : node scripts/check-token.js

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

const db = require('../lib/db');

async function main() {
  console.log('  Interrogation du cache MSAL...\n');

  const r = await db.query(
    'SELECT cache_key, updated_at, pg_column_size(cache_data) as size, cache_data FROM dashboard_cache WHERE cache_key = $1',
    ['msal_token_cache']
  );

  if (!r.rows.length) {
    console.log('  ⚠ Aucun cache MSAL trouvé en base.');
    console.log('  Exécutez node scripts/connect-sharepoint.js pour amorcer la connexion.');
    process.exit(0);
  }

  const row = r.rows[0];
  const d = row.cache_data;
  const blob = typeof d === 'string' ? JSON.parse(d) : d;

  console.log('Clé de Cache          │ Dernière modification   │ Taille');
  console.log('─'.repeat(22) + '┼' + '─'.repeat(23) + '┼' + '─'.repeat(14));
  const date = new Date(row.updated_at).toLocaleString('fr-FR');
  const size = `${Number(row.size).toLocaleString('fr-FR')} octets`;
  console.log(`${row.cache_key.padEnd(21)} │ ${date.padEnd(21)} │ ${size}`);

  try {
    const inner = JSON.parse(blob.blob || '{}');
    const expiresAt = inner.expiresAt ? new Date(inner.expiresAt) : null;
    const now = new Date();
    const isExpired = expiresAt ? expiresAt < now : null;

    console.log('');
    console.log('  État du jeton :');
    console.log(`    Expire le        : ${expiresAt ? expiresAt.toLocaleString('fr-FR') : 'Inconnu'}`);
    console.log(`    Maintenant       : ${now.toLocaleString('fr-FR')}`);
    console.log(`    Statut           : ${isExpired === null ? 'Inconnu' : isExpired ? '⚠ EXPIRÉ — reconnexion nécessaire' : '✅ Valide'}`);
    console.log(`    Refresh token    : ${inner.refreshToken ? '✅ Présent' : '❌ Absent'}`);
  } catch {
    console.log('');
    console.log('  ⚠ Impossible de parser le contenu du cache MSAL.');
  }

  process.exit(0);
}

main().catch(e => { console.error('\n  ❌ Erreur :', e.message); process.exit(1); });
