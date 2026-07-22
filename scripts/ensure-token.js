#!/usr/bin/env node
// scripts/ensure-token.js
//
// Vérifie que le token MSAL est valide et fonctionnel. Si non, tente de le restaurer
// depuis les sources de backup (DB → GitHub). En dernier recours, déclenche une
// reconnexion interactive (device code).
//
// Usage : node scripts/ensure-token.js
//         node scripts/ensure-token.js --force-refresh  (force un refresh même si le token semble valide)
//         node scripts/ensure-token.js --no-interactive  (jamais de device code, échoue silencieusement)

const fs = require('fs');
const path = require('path');
const https = require('https');

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

const ARGS = process.argv.slice(2);
const FORCE_REFRESH = ARGS.includes('--force-refresh');
const NO_INTERACTIVE = ARGS.includes('--no-interactive');

const OWNER = process.env.GITHUB_CACHE_OWNER || 'taphaniangrio-cell';
const REPO = process.env.GITHUB_CACHE_REPO || 'immeit-hub';
const BRANCH = process.env.GITHUB_CACHE_BRANCH || 'cache';
const GITHUB_CACHE_PATH = 'cache/msal-token-cache.json';

function githubGet(apiPath) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return Promise.resolve(null);
  return new Promise((resolve) => {
    const opts = {
      hostname: 'api.github.com',
      path: apiPath,
      method: 'GET',
      timeout: 10000,
      headers: {
        'User-Agent': 'immeit/1.0',
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
      },
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(data)); } catch { resolve(null); }
        } else { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

async function checkDbCache() {
  if (!process.env.DATABASE_URL) return null;
  try {
    const db = require('../lib/db');
    const r = await db.query(
      'SELECT cache_data, updated_at FROM dashboard_cache WHERE cache_key = $1',
      ['msal_token_cache']
    );
    if (r.rows.length > 0) {
      let d = r.rows[0].cache_data;
      if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return null; } }
      if (d && typeof d.blob === 'string' && d.blob) {
        return { blob: d.blob, updatedAt: r.rows[0].updated_at, source: 'db' };
      }
    }
  } catch (e) {
    console.log('  ⚠ DB:', e.message);
  }
  return null;
}

async function checkGithubCache() {
  try {
    const apiPath = `/repos/${OWNER}/${REPO}/contents/${GITHUB_CACHE_PATH}?ref=${BRANCH}`;
    const info = await githubGet(apiPath);
    if (info && info.content) {
      const content = Buffer.from(info.content, 'base64').toString('utf-8');
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed.blob === 'string' && parsed.blob) {
        return { blob: parsed.blob, source: 'github' };
      }
    }
  } catch (e) {
    console.log('  ⚠ GitHub:', e.message);
  }
  return null;
}

function checkLocalCache() {
  try {
    const cacheDir = path.join(process.env.LOCALAPPDATA || '', 'IMMEIT');
    const filePath = path.join(cacheDir, 'msal-cache.json');
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.blob === 'string' && parsed.blob) {
        return { blob: parsed.blob, source: 'local_file' };
      }
    }
  } catch (e) {
    console.log('  ⚠ Local:', e.message);
  }
  return null;
}

function checkRawToken() {
  try {
    const cacheDir = path.join(process.env.LOCALAPPDATA || '', 'IMMEIT');
    const filePath = path.join(cacheDir, 'msal-token.json');
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return data;
    }
  } catch {}
  return null;
}

function analyzeMsalBlob(blob) {
  try {
    const parsed = JSON.parse(blob);
    const result = { hasRefreshToken: false, hasAccount: false, accountCount: 0 };

    if (parsed.RefreshToken) {
      const keys = Object.keys(parsed.RefreshToken);
      result.hasRefreshToken = keys.length > 0 && keys.some(k => parsed.RefreshToken[k].secret);
      result.refreshTokenCount = keys.length;
    }
    if (parsed.Account) {
      result.accountCount = Object.keys(parsed.Account).length;
      result.hasAccount = result.accountCount > 0;
    }
    if (parsed.AccessToken) {
      result.accessTokenCount = Object.keys(parsed.AccessToken).length;
    }
    return result;
  } catch {
    return { error: 'parse_failed' };
  }
}

async function main() {
  console.log('');
  console.log('═'.repeat(58));
  console.log('  VÉRIFICATION DU TOKEN MSAL');
  console.log('═'.repeat(58));
  console.log('');

  // 1. Check local cache
  console.log('  📁 Cache local (msal-cache.json)...');
  const local = checkLocalCache();
  if (local) {
    const info = analyzeMsalBlob(local.blob);
    console.log(`     ✅ Trouvé — ${info.accountCount} compte(s), refresh token: ${info.hasRefreshToken ? '✅' : '❌'}`);
  } else {
    console.log('     ❌ Introuvable ou vide');
  }

  // 2. Check raw token
  console.log('');
  console.log('  📄 Token brut (msal-token.json)...');
  const raw = checkRawToken();
  if (raw) {
    const valid = raw.expiresAt > Date.now();
    console.log(`     Expires: ${raw.expiresAt ? new Date(raw.expiresAt).toLocaleString('fr-FR') : 'N/A'}`);
    console.log(`     Refresh token: ${raw.refreshToken ? '✅ Présent (' + raw.refreshToken.length + ' chars)' : '❌ Absent'}`);
    console.log(`     Statut: ${valid ? '✅ Valide' : '⚠ Expiré'}`);
  } else {
    console.log('     ❌ Introuvable');
  }

  // 3. Check DB cache
  console.log('');
  console.log('  🗄️  Cache DB (PostgreSQL)...');
  const dbCache = await checkDbCache();
  if (dbCache) {
    const info = analyzeMsalBlob(dbCache.blob);
    console.log(`     ✅ Trouvé — ${info.accountCount} compte(s), refresh token: ${info.hasRefreshToken ? '✅' : '❌'}`);
    console.log(`     Dernière MAJ: ${new Date(dbCache.updatedAt).toLocaleString('fr-FR')}`);
  } else {
    console.log('     ⚠ Introuvable ou DB inaccessible');
  }

  // 4. Check GitHub cache
  console.log('');
  console.log('  🐙 Cache GitHub...');
  const ghCache = await checkGithubCache();
  if (ghCache) {
    const info = analyzeMsalBlob(ghCache.blob);
    console.log(`     ✅ Trouvé — ${info.accountCount || '?'} compte(s), refresh token: ${info.hasRefreshToken ? '✅' : '❌'}`);
  } else {
    console.log('     ⚠ Introuvable');
  }

  // 5. Try token acquisition
  console.log('');
  console.log('  🔑 Test d\'acquisition de token...');
  const graphAuth = require('../lib/graph-auth');

  if (FORCE_REFRESH) {
    // Forcer un refresh en vidant le cache mémoire
    console.log('     Mode: force refresh');
  }

  try {
    const token = await graphAuth.getGraphToken({
      allowInteractive: !NO_INTERACTIVE,
      onCode: (resp) => {
        console.log('');
        console.log('  ═══════════════════════════════════════════════');
        console.log('  ' + resp.message);
        console.log('  ═══════════════════════════════════════════════');
        console.log('');
      },
    });
    if (token) {
      console.log(`     ✅ Token obtenu via ${graphAuth.getLastMode()}`);
      console.log('');
      console.log('  Le token est maintenant opérationnel. Les synchronisations');
      console.log('  futures utiliseront ce token automatiquement.');
    } else {
      console.log('     ❌ Échec — aucun token obtenu');
      if (NO_INTERACTIVE) {
        console.log('     Relancez sans --no-interactive pour déclencher une reconnexion.');
      }
    }
  } catch (e) {
    console.log(`     ❌ Erreur: ${e.message}`);
  }

  console.log('');
  process.exit(0);
}

main().catch(e => {
  console.error('\n  ❌ Erreur fatale:', e.message);
  process.exit(1);
});
