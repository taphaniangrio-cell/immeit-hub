// lib/graph-auth.js
//
// Point d'entrée UNIQUE pour obtenir un jeton d'accès Microsoft Graph, quel que soit le
// mode d'authentification disponible. Remplace les deux implémentations parallèles et
// redondantes qui existaient auparavant (lib/sharepoint.js pour l'app-only, lib/auto-sync.js
// pour le device code) — l'existence de deux chemins distincts était elle-même une source
// de divergence/bugs.
//
// Deux modes, essayés dans cet ordre :
//
//   1) App-only (client_credentials) — SI SHAREPOINT_CLIENT_ID + SHAREPOINT_CLIENT_SECRET
//      sont configurés (App Registration Azure AD avec permission Application "Sites.Selected"
//      ou "Sites.Read.All", consentement admin donné une fois). Zéro état à conserver,
//      fonctionne nativement en serverless. C'est le mode recommandé par Microsoft pour ce
//      cas d'usage (accès "démon", sans utilisateur), mais il nécessite des droits admin
//      Azure AD pour la mise en place initiale.
//
//   2) Délégué silencieux (MSAL, cache persistant en base) — mode par défaut, ne nécessite
//      AUCUN droit admin. Une unique connexion interactive (device code), effectuée une
//      fois via `node scripts/connect-sharepoint.js`, suffit : le refresh token est ensuite
//      stocké de façon centralisée (Postgres, voir lib/msal-cache-plugin.js) et réutilisé
//      silencieusement par tous les environnements (local, Vercel, GitHub Actions).
//
// Le device code interactif (dernier recours) n'est JAMAIS déclenché automatiquement
// depuis une requête API ou un cron — seulement si `allowInteractive: true` est passé
// explicitement (script de setup, ou boucle locale en tâche de fond).

const https = require('https');
const fs = require('fs');
const path = require('path');
const { log } = require('./logger');
const { getCacheDir } = require('./cache-dir');

// Clé DB séparée pour le token brut (évite la collision avec le cache MSAL complet)
const RAW_TOKEN_DB_KEY = 'msal_raw_token';

// Lock mutex pour éviter les refreshes concurrents (Vercel instances, cron, loop locale)
let _refreshLock = null;
function _acquireRefreshLock() {
  if (_refreshLock) return _refreshLock;
  _refreshLock = new Promise((resolve) => {
    const interval = setInterval(() => {
      if (!_refreshLockHolder) {
        clearInterval(interval);
        _refreshLockHolder = true;
        resolve();
      }
    }, 50);
  });
  return _refreshLock;
}
let _refreshLockHolder = false;
function _releaseRefreshLock() {
  _refreshLockHolder = false;
  _refreshLock = null;
}

const AZURE_TENANT_ID = process.env.SHAREPOINT_TENANT_ID || 'd852d5cd-724c-4128-8812-ffa5db3f8507';

// Identifiant public de l'application "Microsoft Office", pré-consenti par défaut sur la
// quasi-totalité des tenants Entra ID. Ce N'EST PAS un secret (c'est un identifiant public
// standard, utilisé par de nombreux outils Microsoft officiels pour le flux device code) :
// il ne donne accès à rien tant qu'aucun utilisateur ne s'authentifie derrière.
const DELEGATED_CLIENT_ID = process.env.SHAREPOINT_DELEGATED_CLIENT_ID || '1950a258-227b-4e31-a9cf-717495945fc2';

const GRAPH_SCOPES = ['https://graph.microsoft.com/.default offline_access'];

function isAppOnlyConfigured() {
  return !!(process.env.SHAREPOINT_CLIENT_ID && process.env.SHAREPOINT_CLIENT_SECRET);
}

// ── Mode 1 : app-only (client_credentials) ──────────────────────────────────

function httpsPostForm(url, formBody) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const bodyBuf = Buffer.from(formBody, 'utf-8');
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': bodyBuf.length,
      },
      timeout: 25000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            const err = new Error(parsed.error_description || parsed.error || `HTTP ${res.statusCode}`);
            err.status = res.statusCode;
            reject(err);
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error('Parse failed: ' + data.slice(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(bodyBuf);
    req.end();
  });
}

let _appOnlyTokenCache = { token: null, expiresAt: 0 };

async function getAppOnlyToken() {
  const now = Date.now();
  if (_appOnlyTokenCache.token && _appOnlyTokenCache.expiresAt > now + 60000) {
    return _appOnlyTokenCache.token;
  }
  const tenantId = process.env.SHAREPOINT_TENANT_ID || AZURE_TENANT_ID;
  const clientId = process.env.SHAREPOINT_CLIENT_ID;
  const clientSecret = process.env.SHAREPOINT_CLIENT_SECRET;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  }).toString();

  const data = await httpsPostForm(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, body);
  _appOnlyTokenCache = { token: data.access_token, expiresAt: now + (data.expires_in - 60) * 1000 };
  log('info', 'graph_auth_app_only_token_acquired');
  return _appOnlyTokenCache.token;
}

// ── Mode 2 : délégué (MSAL device code + cache persistant) ─────────────────

let _pca = null;
function getPCA() {
  if (!_pca) {
    const { PublicClientApplication } = require('@azure/msal-node');
    const { createCachePlugin } = require('./msal-cache-plugin');
    _pca = new PublicClientApplication({
      auth: {
        clientId: DELEGATED_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${AZURE_TENANT_ID}`,
      },
      cache: { cachePlugin: createCachePlugin() },
    });
  }
  return _pca;
}

// Nettoyage automatique au démarrage : supprime l'ancienne clé 'msal_token_cache'
// si elle contient un token brut (format corrompu par le bug de collision).
let _cleanupDone = false;
async function _cleanupOldDbKey() {
  if (_cleanupDone) return;
  _cleanupDone = true;
  try {
    const db = require('./db');
    const r = await db.query('SELECT cache_data FROM dashboard_cache WHERE cache_key = $1', ['msal_token_cache']);
    if (r.rows.length > 0) {
      let d = r.rows[0].cache_data;
      if (typeof d === 'string') { try { d = JSON.parse(d); } catch {} }
      if (d && d.blob) {
        let blob = d.blob;
        if (typeof blob === 'string') { try { blob = JSON.parse(blob); } catch {} }
        if (blob && blob.token && blob.expiresAt) {
          await db.query('DELETE FROM dashboard_cache WHERE cache_key = $1', ['msal_token_cache']);
          log('info', 'graph_auth_cleanup_old_db_key');
        }
      }
    }
  } catch { /* best-effort */ }
}
// Lancer le nettoyage en arrière-plan (non-bloquant)
_cleanupOldDbKey();

let _delegatedMemToken = { token: null, expiresAt: 0 };
let _deviceCodeInFlight = null;

// ── Fallback : token brut depuis msal-token.json (bypass MSAL cache format) ───

function _rawTokenFile() { return path.join(getCacheDir(), 'msal-token.json'); }

function _readRawTokenFile() {
  try {
    const raw = fs.readFileSync(_rawTokenFile(), 'utf-8');
    const data = JSON.parse(raw);
    if (data && data.token && data.expiresAt) return data;
  } catch { /* ignore */ }
  return null;
}

async function _readRawTokenFromDb() {
  try {
    const db = require('./db');
    // Utilise la clé séparée pour le token brut (pas la même que le cache MSAL)
    const r = await db.query('SELECT cache_data FROM dashboard_cache WHERE cache_key = $1', [RAW_TOKEN_DB_KEY]);
    if (r.rows.length > 0) {
      let d = r.rows[0].cache_data;
      if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return null; } }
      if (d && d.blob) {
        let blob = d.blob;
        if (typeof blob === 'string') { try { blob = JSON.parse(blob); } catch { return null; } }
        if (blob && blob.token && blob.expiresAt) return blob;
      }
    }
  } catch (e) {
    log('warn', 'graph_auth_raw_token_db_read_failed', { error: e.message });
  }
  return null;
}

async function _readRawToken() {
  // File first (fast, local)
  const fileToken = _readRawTokenFile();
  if (fileToken) return fileToken;
  // DB fallback (Vercel, GitHub Actions)
  return await _readRawTokenFromDb();
}

function _saveRawTokenFile(data) {
  try { fs.writeFileSync(_rawTokenFile(), JSON.stringify(data, null, 2), 'utf-8'); } catch { /* ignore */ }
}

async function _saveRawTokenToDb(entry) {
  try {
    const db = require('./db');
    await db.query(
      `INSERT INTO dashboard_cache (cache_key, cache_data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (cache_key) DO UPDATE SET cache_data = $2, updated_at = NOW()`,
      [RAW_TOKEN_DB_KEY, JSON.stringify({ blob: JSON.stringify(entry) })]
    );
  } catch (e) {
    log('warn', 'graph_auth_raw_token_db_save_failed', { error: e.message });
  }
}

async function _refreshWithRawRefreshToken(refreshToken) {
  const body = new URLSearchParams({
    client_id: DELEGATED_CLIENT_ID,
    refresh_token: refreshToken,
    scope: GRAPH_SCOPES.join(' '),
    grant_type: 'refresh_token',
  }).toString();
  try {
    const data = await httpsPostForm(
      `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`, body
    );
    if (data.access_token) {
      const entry = {
        token: data.access_token,
        expiresAt: Date.now() + ((data.expires_in || 3600) - 60) * 1000,
        refreshToken: data.refresh_token || refreshToken,
      };
      _saveRawTokenFile(entry);
      _saveRawTokenToDb(entry).catch(() => {});
      log('info', 'graph_auth_raw_refresh_success');
      return entry;
    }
  } catch (e) {
    log('warn', 'graph_auth_raw_refresh_failed', { error: e.message });
  }
  return null;
}

async function _tryMsalSilent(now) {
  const pca = getPCA();
  const accounts = await pca.getTokenCache().getAllAccounts();
  if (accounts && accounts.length > 0) {
    const result = await pca.acquireTokenSilent({ account: accounts[0], scopes: GRAPH_SCOPES });
    _delegatedMemToken = {
      token: result.accessToken,
      expiresAt: result.expiresOn ? result.expiresOn.getTime() - 120000 : now + 3300000,
    };
    // Backup : extraire le refresh token du cache MSAL et le sauvegarder en raw token
    // pour que le fallback raw token fonctionne même si le cache MSAL ne se charge plus.
    try {
      const serialized = pca.getTokenCache().serialize();
      const parsed = JSON.parse(serialized);
      let rtSecret = null;
      if (parsed.RefreshToken) {
        const rtKeys = Object.keys(parsed.RefreshToken);
        for (const k of rtKeys) {
          if (parsed.RefreshToken[k].secret) {
            rtSecret = parsed.RefreshToken[k].secret;
            break;
          }
        }
      }
      if (rtSecret) {
        const rawEntry = {
          token: result.accessToken,
          expiresAt: _delegatedMemToken.expiresAt,
          refreshToken: rtSecret,
        };
        _saveRawTokenFile(rawEntry);
        _saveRawTokenToDb(rawEntry).catch(() => {});
      }
    } catch { /* best-effort */ }
    return _delegatedMemToken.token;
  }
  return null;
}

async function getDelegatedTokenSilent() {
  const now = Date.now();
  if (_delegatedMemToken.token && _delegatedMemToken.expiresAt > now + 60000) {
    return _delegatedMemToken.token;
  }

  // Lock mutex : un seul processus refresh le token à la fois
  await _acquireRefreshLock();
  try {
    // Re-vérifier le cache mémoire après acquisition du lock (un autre processus a peut-être déjà refreshé)
    if (_delegatedMemToken.token && _delegatedMemToken.expiresAt > now + 60000) {
      return _delegatedMemToken.token;
    }

    // Essai MSAL normal
    try {
      const token = await _tryMsalSilent(now);
      if (token) return token;
    } catch (e) {
      log('warn', 'graph_auth_silent_failed', { error: e && e.message });
      // Retry: recharger le cache depuis la DB (un autre instance Vercel a peut-être
      // rafraîchi le token entre-temps — race condition sur les refresh tokens).
      try {
        _pca = null;
        const token = await _tryMsalSilent(now);
        if (token) {
          log('info', 'graph_auth_silent_retry_ok');
          return token;
        }
      } catch (e2) {
        log('warn', 'graph_auth_silent_retry_failed', { error: e2 && e2.message });
      }
    }

    // Fallback : token brut (msal-token.json ou DB)
    const raw = await _readRawToken();
    if (raw) {
      if (raw.expiresAt > now + 60000) {
        log('info', 'graph_auth_raw_token_valid');
        _delegatedMemToken = { token: raw.token, expiresAt: raw.expiresAt };
        return raw.token;
      }
      if (raw.refreshToken) {
        log('info', 'graph_auth_raw_refreshing');
        const refreshed = await _refreshWithRawRefreshToken(raw.refreshToken);
        if (refreshed) {
          _delegatedMemToken = { token: refreshed.token, expiresAt: refreshed.expiresAt };
          return refreshed.token;
        }
      }
    }

    return null;
  } finally {
    _releaseRefreshLock();
  }
}

/**
 * Démarre (ou rejoint) une connexion interactive device code. Toujours non-bloquant pour
 * l'appelant tant qu'on n'attend pas la promesse retournée.
 */
function startInteractiveLogin(onCode) {
  if (_deviceCodeInFlight) return _deviceCodeInFlight;
  const pca = getPCA();
  _deviceCodeInFlight = pca.acquireTokenByDeviceCode({
    scopes: GRAPH_SCOPES,
    deviceCodeCallback: (resp) => {
      log('info', 'graph_auth_device_code', { url: resp.verificationUri, code: resp.userCode });
      if (onCode) {
        onCode(resp);
      } else {
        console.log('\n  ═══════════════════════════════════════════════');
        console.log('  ' + resp.message);
        console.log('  ═══════════════════════════════════════════════\n');
      }
    },
  }).then((result) => {
    _delegatedMemToken = {
      token: result.accessToken,
      expiresAt: result.expiresOn ? result.expiresOn.getTime() - 120000 : Date.now() + 3300000,
    };
    log('info', 'graph_auth_device_code_success');
    _deviceCodeInFlight = null;
    return result.accessToken;
  }).catch((e) => {
    log('warn', 'graph_auth_device_code_failed', { error: e && e.message });
    _deviceCodeInFlight = null;
    throw e;
  });
  return _deviceCodeInFlight;
}

let _lastMode = null;
function getLastMode() { return _lastMode; }

/**
 * @param {object} [opts]
 * @param {boolean} [opts.allowInteractive] - autorise un device code interactif si aucun
 *   jeton n'est disponible autrement. À réserver au script de setup et à la boucle locale
 *   (JAMAIS depuis une requête API : cela bloquerait la requête en attendant un humain).
 * @param {boolean} [opts.startBackgroundIfNeeded] - si true et qu'aucun jeton n'est
 *   disponible, démarre un device code EN ARRIÈRE-PLAN sans attendre (non-bloquant).
 * @param {(resp:object)=>void} [opts.onCode] - callback appelé avec le code à afficher.
 * @returns {Promise<string|null>}
 */
async function getGraphToken(opts) {
  opts = opts || {};

  if (isAppOnlyConfigured()) {
    try {
      const token = await getAppOnlyToken();
      _lastMode = 'app_only';
      return token;
    } catch (e) {
      log('warn', 'graph_auth_app_only_failed', { error: e && e.message });
      // on retente via le mode délégué ci-dessous plutôt que d'échouer immédiatement
    }
  }

  const silent = await getDelegatedTokenSilent();
  if (silent) {
    _lastMode = 'delegated_silent';
    return silent;
  }

  if (opts.allowInteractive) {
    try {
      const token = await startInteractiveLogin(opts.onCode);
      _lastMode = 'delegated_interactive';
      return token;
    } catch {
      return null;
    }
  }

  if (opts.startBackgroundIfNeeded && !_deviceCodeInFlight) {
    startInteractiveLogin().catch(() => {});
  }

  return null;
}

module.exports = {
  getGraphToken,
  isAppOnlyConfigured,
  startInteractiveLogin,
  getLastMode,
};
