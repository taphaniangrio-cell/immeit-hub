// lib/msal-cache-plugin.js
//
// Cache MSAL persistant et partagé (Postgres → fichier local → GitHub).
//
// Chaîne de lecture : DB → fichier → GitHub
// Chaîne d'écriture : DB + fichier + GitHub (parallèle, best-effort)
//
// Le stockage GitHub sert de filet de sécurité quand Supabase est en panne
// (quota dépassé) — c'est le cas actuellement. Le token MSAL (dont le refresh
// token) est stocké sur la branche `cache` du dépôt GitHub, accessible par
// Vercel et tous les environnements.

const https = require('https');
const path = require('path');
const { log } = require('./logger');
const { getCacheDir, safeReadFile, safeWriteFile } = require('./cache-dir');

const DB_CACHE_KEY = 'msal_token_cache';
const GITHUB_CACHE_PATH = 'cache/msal-token-cache.json';
const OWNER = process.env.GITHUB_CACHE_OWNER || 'taphaniangrio-cell';
const REPO = process.env.GITHUB_CACHE_REPO || 'immeit-hub';
const BRANCH = process.env.GITHUB_CACHE_BRANCH || 'cache';

function cacheFilePath() {
  return path.join(getCacheDir(), 'msal-cache.json');
}

// ── GitHub helpers (minimal, avoids circular dep with github-cache.js) ──

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

function githubPut(apiPath, body) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    log('warn', 'msal_cache_github_no_token');
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const bodyStr = JSON.stringify(body);
    const opts = {
      hostname: 'api.github.com',
      path: apiPath,
      method: 'PUT',
      timeout: 20000,
      headers: {
        'User-Agent': 'immeit/1.0',
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(true);
        } else {
          log('warn', 'msal_cache_github_put_failed', {
            status: res.statusCode,
            body: data.slice(0, 300),
          });
          resolve(false);
        }
      });
    });
    req.on('error', (e) => { log('warn', 'msal_cache_github_put_error', { error: e.message }); resolve(false); });
    req.on('timeout', () => { req.destroy(); log('warn', 'msal_cache_github_put_timeout'); resolve(false); });
    req.write(bodyStr);
    req.end();
  });
}

async function loadFromGithub() {
  try {
    const apiPath = `/repos/${OWNER}/${REPO}/contents/${GITHUB_CACHE_PATH}?ref=${BRANCH}`;
    const info = await githubGet(apiPath);
    if (info && info.content) {
      const content = Buffer.from(info.content, 'base64').toString('utf-8');
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed.blob === 'string' && parsed.blob) {
        log('info', 'msal_cache_github_loaded');
        return parsed.blob;
      }
    }
  } catch (e) {
    log('warn', 'msal_cache_github_read_failed', { error: e && e.message });
  }
  return null;
}

async function saveToGithub(blob) {
  try {
    const apiPath = `/repos/${OWNER}/${REPO}/contents/${GITHUB_CACHE_PATH}`;
    let sha;
    try {
      const info = await githubGet(apiPath + '?ref=' + BRANCH);
      sha = info && info.sha;
    } catch { /* 404 = first time, no sha needed */ }

    const content = Buffer.from(JSON.stringify({ blob }), 'utf-8').toString('base64');
    const body = {
      message: 'msal-cache: auto-update ' + new Date().toISOString().slice(0, 16),
      content,
      branch: BRANCH,
    };
    if (sha) body.sha = sha;

    const ok = await githubPut(apiPath, body);
    if (ok) log('info', 'msal_cache_github_saved');
    else log('warn', 'msal_cache_github_save_failed');
  } catch (e) {
    log('warn', 'msal_cache_github_save_failed', { error: e && e.message });
  }
}

// ── Main load/save chain ──

async function loadBlob() {
  // 1. DB
  if (process.env.DATABASE_URL) {
    try {
      const db = require('./db');
      const r = await db.query('SELECT cache_data FROM dashboard_cache WHERE cache_key = $1', [DB_CACHE_KEY]);
      if (r.rows.length > 0) {
        let row = r.rows[0].cache_data;
        if (typeof row === 'string') { try { row = JSON.parse(row); } catch { row = null; } }
        if (row && typeof row.blob === 'string' && row.blob) return row.blob;
      }
    } catch (e) {
      log('warn', 'msal_cache_db_read_failed', { error: e && e.message });
    }
  }
  // 2. Fichier local
  try {
    const raw = safeReadFile(cacheFilePath());
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.blob === 'string' && parsed.blob) return parsed.blob;
    }
  } catch (e) { /* ignore */ }
  // 3. GitHub
  const ghBlob = await loadFromGithub();
  if (ghBlob) return ghBlob;
  return null;
}

async function saveBlob(blob) {
  let dbOk = false;
  // 1. DB (avec retry)
  if (process.env.DATABASE_URL) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const db = require('./db');
        await db.query(
          `INSERT INTO dashboard_cache (cache_key, cache_data, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (cache_key) DO UPDATE SET cache_data = $2, updated_at = NOW()`,
          [DB_CACHE_KEY, JSON.stringify({ blob })]
        );
        dbOk = true;
        break;
      } catch (e) {
        log('warn', 'msal_cache_db_write_failed', { attempt, error: e.message });
        if (attempt < 3) await new Promise(r => setTimeout(r, 500 * attempt));
      }
    }
  }
  // 2. Fichier local
  try { safeWriteFile(cacheFilePath(), { blob }); } catch { /* ignore */ }
  // 3. GitHub (async, best-effort — ne pas bloquer le refresh token)
  saveToGithub(blob).catch(() => {});
  if (dbOk) log('debug', 'msal_cache_saved', { where: 'db+github' });
}

/**
 * Construit un ICachePlugin MSAL Node prêt à l'emploi.
 */
function createCachePlugin() {
  return {
    beforeCacheAccess: async (cacheContext) => {
      const blob = await loadBlob();
      if (blob) {
        try {
          cacheContext.tokenCache.deserialize(blob);
        } catch (e) {
          log('warn', 'msal_cache_deserialize_failed', { error: e && e.message });
        }
      }
    },
    afterCacheAccess: async (cacheContext) => {
      if (cacheContext.cacheHasChanged) {
        try {
          const blob = cacheContext.tokenCache.serialize();
          await saveBlob(blob);
        } catch (e) {
          log('warn', 'msal_cache_serialize_failed', { error: e && e.message });
        }
      }
    },
  };
}

/** Efface le cache persistant (utile pour forcer une reconnexion complète). */
async function clearCache() {
  await saveBlob('');
}

module.exports = { createCachePlugin, clearCache };
