#!/usr/bin/env node
// scripts/connect-sharepoint.js
//
// À exécuter en local, UNE SEULE FOIS (ou uniquement si une alerte "reconnexion nécessaire"
// est reçue par email). Amorce la synchronisation autonome :
//
//   1. Ouvre une connexion interactive (device code) — la seule étape qui nécessite un
//      humain, une seule fois.
//   2. Le jeton obtenu (et surtout le refresh token) est stocké de façon persistante dans
//      la base Postgres partagée (voir lib/msal-cache-plugin.js).
//   3. À partir de là, TOUS les environnements (ce poste, Vercel, GitHub Actions) relisent
//      ce même cache et rafraîchissent leur jeton silencieusement, sans aucune autre
//      intervention humaine.
//
// Prérequis : DATABASE_URL doit être configurée dans .env (c'est déjà le cas si l'appli
// est en service), sinon le jeton resterait local à ce poste et ne serait pas partagé.
//
// Usage : node scripts/connect-sharepoint.js

const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

const graphAuth = require('../lib/graph-auth');
const sharepoint = require('../lib/sharepoint');

async function main() {
  console.log('');
  console.log('═'.repeat(58));
  console.log('  CONNEXION SHAREPOINT — IMMEIT');
  console.log('═'.repeat(58));

  if (!process.env.DATABASE_URL) {
    console.log('');
    console.log('  ⚠ DATABASE_URL n\'est pas configurée dans .env');
    console.log('    Sans base de données partagée, le jeton resterait local à ce');
    console.log('    poste et Vercel ne pourrait pas le réutiliser.');
    console.log('    Ajoutez DATABASE_URL dans .env puis relancez ce script.');
    console.log('');
    process.exit(1);
  }

  if (graphAuth.isAppOnlyConfigured()) {
    console.log('');
    console.log('  ℹ SHAREPOINT_CLIENT_ID et SHAREPOINT_CLIENT_SECRET sont configurés :');
    console.log('    le mode "application" (zéro connexion humaine, y compris pour le');
    console.log('    tout premier accès) est déjà actif. Cette étape n\'est pas nécessaire.');
    console.log('');
    process.exit(0);
  }

  console.log('');
  console.log('  Ouvre le lien ci-dessous dans un navigateur et entre le code affiché.');
  console.log('  Cette connexion ne devrait plus jamais être nécessaire après (sauf');
  console.log('  révocation manuelle de la session côté Microsoft 365).');
  console.log('');

  try {
    console.log('  ⏳ Lancement du device code Microsoft...');
    const token = await graphAuth.startInteractiveLogin((resp) => {
      console.log('');
      console.log('  ═══════════════════════════════════════════════');
      console.log('  ' + resp.message);
      console.log('  ═══════════════════════════════════════════════');
      console.log('');
    });
    if (!token) throw new Error('Aucun jeton obtenu');
    console.log('  ✅ Connecté — jeton stocké en base de données (partagé avec Vercel).\n');

    // Nettoyage : supprimer l'ancienne clé DB 'msal_token_cache' si elle contient
    // un token brut (format {token, expiresAt}) au lieu du cache MSAL complet.
    // Cela corrige le bug de collision de clé qui cassait le refresh silencieux.
    try {
      const db = require('../lib/db');
      const r = await db.query('SELECT cache_data FROM dashboard_cache WHERE cache_key = $1', ['msal_token_cache']);
      if (r.rows.length > 0) {
        let d = r.rows[0].cache_data;
        if (typeof d === 'string') { try { d = JSON.parse(d); } catch {} }
        if (d && d.blob) {
          let blob = d.blob;
          if (typeof blob === 'string') { try { blob = JSON.parse(blob); } catch {} }
          // Si c'est un token brut (a .token et .expiresAt), c'est le format corrompu
          if (blob && blob.token && blob.expiresAt) {
            await db.query('DELETE FROM dashboard_cache WHERE cache_key = $1', ['msal_token_cache']);
            console.log('  🧹 Ancien cache token brut nettoyé de la base (corrigé le bug de collision).\n');
          }
        }
      }
    } catch (e) {
      // Best-effort, pas bloquant
      console.log('  ⚠ Nettoyage DB ignoré:', e.message);
    }

    console.log('  🔍 Vérification (lecture du fichier de suivi)...');
    const data = await sharepoint.fetchDashboardData();
    if (data.connected) {
      const sheetName = process.env.SHAREPOINT_SHEET_NAME || 'Suivi Demandes 2026';
      console.log(`  ✅ ${data.items.length} lignes lues avec succès dans "${sheetName}".\n`);
      console.log('  La synchronisation est maintenant autonome : Vercel et GitHub Actions');
      console.log('  réutiliseront automatiquement cette connexion via la base partagée.');
      console.log('  Aucun déploiement ni action supplémentaire n\'est requis pour ça.');
    } else {
      console.log('  ⚠ Jeton obtenu, mais la lecture du fichier a échoué : ' + data.message);
    }
    console.log('');
  } catch (err) {
    console.error('\n  ❌ Échec :', err.message);
    console.error('');
    process.exit(1);
  }
}

main();
