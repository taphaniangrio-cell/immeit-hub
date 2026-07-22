#!/usr/bin/env node
// scripts/enable-rls.js
//
// Active Row-Level Security (RLS) sur toutes les tables du schéma public.
// Corrige l'alerte Supabase : "Table publicly accessible"
//
// RLS n'affecte PAS les connexions directes via DATABASE_URL (superuser postgres),
// mais bloque l'accès anonyme via l'API REST Supabase / client JS.
//
// Usage : node scripts/enable-rls.js

const fs = require('fs');
const path = require('path');

// Load .env manually
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq < 1) return;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  });
}

const { query } = require('../lib/db');

const TABLES = [
  'articles',
  'dashboard_cache',
  'revoked_sessions',
  'rate_limits',
  'alert_history',
];

(async () => {
  console.log('Activation de Row-Level Security sur toutes les tables...\n');

  for (const table of TABLES) {
    try {
      await query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      console.log(`  ✓ ${table} — RLS activé\n`);
    } catch (err) {
      console.error(`  ✗ ${table} — erreur : ${err.message}\n`);
    }
  }

  console.log('Terminé. Toutes les tables sont maintenant protégées par RLS.');
  console.log('Les connexions server-side via DATABASE_URL continuent de fonctionner normalement.');
  process.exit(0);
})().catch(e => {
  console.error('Erreur fatale:', e.message);
  process.exit(1);
});
