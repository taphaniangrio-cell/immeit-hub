#!/usr/bin/env node
// scripts/restore-msal-cache.js
//
// Restaure le cache MSAL en DB depuis le fichier local msal-cache.json.
// Utile quand la DB a été corrompue ou quand le cache local est la seule source fiable.

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

const db = require('../lib/db');

async function main() {
  const cacheDir = process.env.LOCALAPPDATA || path.join(__dirname, '..');
  const localFile = path.join(cacheDir, 'IMMEIT', 'msal-cache.json');

  if (!fs.existsSync(localFile)) {
    console.error('  Fichier local introuvable:', localFile);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(localFile, 'utf-8'));
  if (!raw.blob || typeof raw.blob !== 'string') {
    console.error('  Cache local invalide (pas de blob)');
    process.exit(1);
  }

  console.log('  Taille du blob local:', raw.blob.length, 'octets');

  const blobObj = JSON.parse(raw.blob);
  const hasRT = blobObj.RefreshToken && Object.keys(blobObj.RefreshToken).length > 0;
  const hasAccount = blobObj.Account && Object.keys(blobObj.Account).length > 0;
  console.log('  RefreshToken:', hasRT ? '✅' : '❌');
  console.log('  Account:', hasAccount ? '✅' : '❌');

  await db.query(
    `INSERT INTO dashboard_cache (cache_key, cache_data, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (cache_key) DO UPDATE SET cache_data = $2, updated_at = NOW()`,
    ['msal_token_cache', JSON.stringify({ blob: raw.blob })]
  );

  console.log('  ✅ Cache MSAL restauré en DB');

  const r = await db.query(
    `SELECT pg_column_size(cache_data) as size FROM dashboard_cache WHERE cache_key = $1`,
    ['msal_token_cache']
  );
  console.log('  Taille en DB:', r.rows[0]?.size, 'octets');

  process.exit(0);
}

main().catch(e => { console.error('  ❌', e.message); process.exit(1); });
