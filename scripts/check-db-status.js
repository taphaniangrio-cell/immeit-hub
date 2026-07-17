// scripts/check-db-status.js
//
// Inspecte les clés de cache dans la table dashboard_cache (PostgreSQL).
// Affiche la date de dernière modification et la taille physique de chaque entrée.
//
// Usage : node scripts/check-db-status.js

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
  console.error('  Copiez .env.example en .env et renseignez vos variables.');
  process.exit(1);
}

const db = require('../lib/db');

async function main() {
  console.log('  Interrogation du cache de synchronisation PostgreSQL...\n');

  console.log('Clé de Cache          │ Dernière modification   │ Taille');
  console.log('─'.repeat(22) + '┼' + '─'.repeat(23) + '┼' + '─'.repeat(14));

  const keys = ['sharepoint_suivi_2026', 'msal_token_cache', 'diff_prev_state'];

  for (const key of keys) {
    try {
      const r = await db.query(
        'SELECT cache_key, updated_at, pg_column_size(cache_data) as size FROM dashboard_cache WHERE cache_key = $1',
        [key]
      );
      if (r.rows.length > 0) {
        const row = r.rows[0];
        const date = new Date(row.updated_at).toLocaleString('fr-FR');
        const size = `${Number(row.size).toLocaleString('fr-FR')} octets`;
        console.log(`${row.cache_key.padEnd(21)} │ ${date.padEnd(21)} │ ${size}`);
      } else {
        console.log(`${key.padEnd(21)} │ ${'ABSENT'.padEnd(21)} │ -`);
      }
    } catch (e) {
      console.log(`${key.padEnd(21)} │ ${'ERREUR'.padEnd(21)} │ ${e.message}`);
    }
  }

  process.exit(0);
}

main().catch(e => { console.error('\n  ❌ Erreur :', e.message); process.exit(1); });
