const path = require('path');
const https = require('https');
const { log } = require('./logger');
const { CONSTANTS } = require('./constants');
const eventBus = require('./events');
const { getCacheDir, safeWriteFile, safeReadFile } = require('./cache-dir');

function cacheFile() { return path.join(getCacheDir(), 'dash-cache.json'); }
const SYNC_DELAY = CONSTANTS.AUTO_SYNC_REFRESH_INTERVAL || 300_000;
let syncTimer = null;
let isSyncing = false;

const SHAREPOINT_HOST = process.env.SHAREPOINT_SITE_HOSTNAME || 'shiftup.sharepoint.com';
const SHAREPOINT_PATH = process.env.SHAREPOINT_SITE_PATH || 'sites/P2M2022';
const FILE_ID = process.env.SHAREPOINT_FILE_ID || '55686017-3ff9-43f7-ab28-5b910871a4b0';
const SHEET_NAME = process.env.SHAREPOINT_SHEET_NAME || 'Suivi Demandes 2026';
const AZURE_TENANT_ID = process.env.SHAREPOINT_TENANT_ID || 'd852d5cd-724c-4128-8812-ffa5db3f8507';
const AZURE_CLIENT_ID = process.env.SHAREPOINT_CLIENT_ID || '1950a258-227b-4e31-a9cf-717495945fc2';

function isAppOnlyConfigured() {
  return !!(process.env.SHAREPOINT_TENANT_ID && process.env.SHAREPOINT_CLIENT_ID && process.env.SHAREPOINT_CLIENT_SECRET);
}

function saveCache(data) {
  var f = cacheFile();
  if (safeWriteFile(f, data)) {
    log('info', 'auto_sync_cache_saved', { path: f, items: data.items?.length || 0 });
    try { require('./github-cache').publishCache(data).catch(function() {}); } catch {}
  } else {
    log('error', 'auto_sync_cache_write_failed', { path: f });
  }
}

function loadCache() {
  try {
    var f = cacheFile();
    var raw = safeReadFile(f);
    if (raw) {
      var data = JSON.parse(raw);
      if (data && data.headers && data.items) return data;
    }
  } catch (e) { log('warn', 'auto_sync_cache_read_failed', { error: e?.message }); }
  return null;
}

async function loadDbCache() {
  try {
    const db = require('./db');
    const r = await db.query(
      `SELECT cache_data FROM dashboard_cache WHERE cache_key = 'sharepoint_suivi_2026'`
    );
    if (r.rows.length > 0) {
      var data = r.rows[0].cache_data;
      if (typeof data === 'string') { try { data = JSON.parse(data); } catch {} }
      if (data && data.items && data.items.length > 0) {
        log('info', 'auto_sync_db_cache_loaded', { items: data.items.length, syncedAt: data.syncedAt });
        return data;
      }
    }
  } catch (e) { log('warn', 'auto_sync_db_cache_failed', { error: e?.message }); }
  return null;
}

async function tryDbSave(data) {
  try {
    const db = require('./db');
    await db.query(
      `INSERT INTO dashboard_cache (cache_key, cache_data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (cache_key) DO UPDATE SET cache_data = $2, updated_at = NOW()`,
      ['sharepoint_suivi_2026', JSON.stringify(data)]
    );
    log('info', 'auto_sync_db_saved');
  } catch (e) { log('warn', 'auto_sync_db_save_failed', { error: e?.message }); }
}

function httpsGet(url, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      timeout: CONSTANTS.SHAREPOINT_HTTPS_TIMEOUT,
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]);
}

let _msalToken = { token: null, expiresAt: 0 };
let _deviceCodePromise = null;

async function getGraphToken() {
  if (_msalToken.token && _msalToken.expiresAt > Date.now() + 60000) return _msalToken.token;

  // Si un device code est déjà en cours, attendre 30s (cache MSAL + refresh)
  if (_deviceCodePromise) {
    var result = await raceTimeout(_deviceCodePromise, 30000);
    if (result) return result;
    return null;
  }

  try {
    const { DeviceCodeCredential } = require('@azure/identity');
    var credential = new DeviceCodeCredential({
      tenantId: AZURE_TENANT_ID,
      clientId: AZURE_CLIENT_ID,
      userPromptCallback: function(info) {
        console.log('\n  ═══════════════════════════════════════════════');
        console.log('  ' + info.message);
        console.log('  ═══════════════════════════════════════════════\n');
        log('info', 'auto_sync_device_code', { url: info.verificationUrl, code: info.userCode });
      },
    });

    _deviceCodePromise = credential.getToken('https://graph.microsoft.com/.default').then(function(token) {
      _msalToken = { token: token.token, expiresAt: token.expiresOnTimestamp ? token.expiresOnTimestamp - 300000 : Date.now() + 3500000 };
      log('info', 'auto_sync_token_acquired', { expiresAt: new Date(_msalToken.expiresAt).toISOString() });
      _deviceCodePromise = null;
      return _msalToken.token;
    }).catch(function(e) {
      log('warn', 'auto_sync_token_failed', { error: e.message });
      _msalToken = { token: null, expiresAt: 0 };
      _deviceCodePromise = null; // ← remet à zéro pour qu'un nouveau code soit généré au prochain cycle
      return null;
    });

    return null;
  } catch (e) {
    return null;
  }
}

function raceTimeout(promise, ms) {
  if (!promise) return new Promise(function(resolve) { setTimeout(function() { resolve(null); }, ms); });
  return Promise.race([
    promise,
    new Promise(function(resolve) { setTimeout(function() { resolve(null); }, ms); })
  ]);
}

let _cachedSiteId = null;
let _lastKnownTimestamp = null;

async function fetchFromGraph(token) {
  log('info', 'auto_sync_fetching_site');
  const site = await withTimeout(httpsGet(
    'https://graph.microsoft.com/v1.0/sites/' + SHAREPOINT_HOST + ':/' + SHAREPOINT_PATH, token
  ), 15000);
  _cachedSiteId = site.id;

  log('info', 'auto_sync_fetching_workbook');
  let driveItem;
  try {
    driveItem = await withTimeout(httpsGet(
      'https://graph.microsoft.com/v1.0/sites/' + site.id + '/drive/items/' + FILE_ID + '?select=id,lastModifiedBy,lastModifiedDateTime', token
    ), 15000);
  } catch {
    const search = await withTimeout(httpsGet(
      'https://graph.microsoft.com/v1.0/sites/' + site.id + '/drive/root/search(q=\'' + SHEET_NAME + '\')', token
    ), 15000);
    if (!search.value || !search.value.length) throw new Error('Fichier introuvable');
    driveItem = search.value[0];
  }

  const itemId = driveItem.id;
  const lastModifiedBy = driveItem.lastModifiedBy && driveItem.lastModifiedBy.user ? driveItem.lastModifiedBy.user.displayName : 'Inconnu';
  _lastKnownTimestamp = driveItem.lastModifiedDateTime || '';

  const sheetData = await withTimeout(httpsGet(
    'https://graph.microsoft.com/v1.0/sites/' + site.id + '/drive/items/' + itemId + '/workbook/worksheets(\'' + encodeURIComponent(SHEET_NAME) + '\')/usedRange', token
  ), 30000);

  const rows = sheetData.values || [];
  if (rows.length < 2) throw new Error('Pas assez de donnees');

  const headers = rows[0];
  const allItems = rows.slice(1).map(function(row, idx) {
    var obj = { _row: idx + 2 };
    headers.forEach(function(h, i) {
      var key = String(h).toLowerCase().trim().replace(/[\s\/]+/g, '_').replace(/[^a-z0-9_]/g, '');
      obj[key] = row[i] != null ? String(row[i]).trim() : '';
    });
    return obj;
  });
  const { filterDataRows } = require('./sharepoint');
  const items = filterDataRows(allItems, headers);

  const cacheData = { headers: headers, items: items, syncedAt: new Date().toISOString(), source: 'device_code', _rawCount: allItems.length };
  saveCache(cacheData);
  tryDbSave(cacheData);

  try {
    const diffDetector = require('./diff-detector');
    const emailAlert = require('./email-alert');
    const report = await diffDetector.buildDiffReport(cacheData, lastModifiedBy);
    if (report) await emailAlert.sendAlert(report);
  } catch (e) { log('warn', 'auto_sync_diff_alert_failed', { error: e && e.message }); }

  log('info', 'auto_sync_graph_complete', { raw: allItems.length, filtered: items.length });
  try { eventBus.emit('dashboard-updated', { source: 'device_code', items: items.length, headers: headers, syncedAt: cacheData.syncedAt }); } catch {}
  return cacheData;
}

async function tryInteractive() {
  if (!_deviceCodePromise && !_msalToken.token) return null;
  try {
    if (_msalToken.token && _msalToken.expiresAt > Date.now() + 60000) {
      if (_cachedSiteId && _lastKnownTimestamp) {
        try {
          const di = await withTimeout(httpsGet(
            'https://graph.microsoft.com/v1.0/sites/' + _cachedSiteId + '/drive/items/' + FILE_ID + '?select=lastModifiedDateTime', _msalToken.token
          ), 10000);
          if (di.lastModifiedDateTime === _lastKnownTimestamp) {
            log('info', 'auto_sync_unchanged');
            var cached = loadCache();
            if (cached) return cached;
          }
        } catch {}
      }
      return await fetchFromGraph(_msalToken.token);
    }
    const token = await getGraphToken();
    if (!token) return null;
    return await fetchFromGraph(token);
  } catch (e) {
    log('warn', 'auto_sync_interactive_failed', { error: e && e.message });
    return null;
  }
}

async function tryClientCredentials() {
  try {
    const sp = require('./sharepoint');
    if (sp.isConfigured()) {
      const result = await sp.fetchDashboardData();
      if (result && result.connected && result.items?.length > 0) {
        const cacheData = { headers: result.headers, items: result.items, syncedAt: new Date().toISOString(), source: 'client_credentials', _rawCount: result._rawCount };
        saveCache(cacheData);
        tryDbSave(cacheData);
        try {
          eventBus.emit('dashboard-updated', { source: 'client_credentials', items: result.items.length, headers: result.headers, syncedAt: cacheData.syncedAt });
          const diffDetector = require('./diff-detector');
          const emailAlert = require('./email-alert');
          const report = await diffDetector.buildDiffReport(cacheData, 'Client Credentials');
          if (report) await emailAlert.sendAlert(report).catch(e => log('warn', 'auto_sync_cc_alert_failed', { error: e?.message }));
        } catch {}
        log('info', 'auto_sync_cc_complete', { items: result.items.length });
        return cacheData;
      }
    }
  } catch (e) { log('warn', 'auto_sync_cc_failed', { error: e?.message }); }
  return null;
}

function startBackgroundAuth() {
  if (_deviceCodePromise || isAppOnlyConfigured()) return;
  getGraphToken().catch(function() {});
}

async function sync() {
  // 1) Client credentials (app-only) — fully automated, zéro intervention humaine
  if (isAppOnlyConfigured()) {
    const fresh = await tryClientCredentials();
    if (fresh) {
      log('info', 'auto_sync_live', { source: 'client_credentials', items: fresh.items.length });
      return fresh;
    }
  }

  // 2) Device code — démarre en arrière-plan si pas de token, ne bloque jamais
  startBackgroundAuth();
  const interactive = await tryInteractive();
  if (interactive) {
    log('info', 'auto_sync_live', { source: interactive.source || 'device_code', items: interactive.items.length });
    return interactive;
  }

  // 3) Cache base de données — alimenté par la prod Vercel ou le sync local
  const dbCached = await loadDbCache();
  if (dbCached) {
    log('info', 'auto_sync_from_db_cache', { items: dbCached.items.length, syncedAt: dbCached.syncedAt });
    return dbCached;
  }

  // 4) Cache fichier local
  const cached = loadCache();
  if (cached) {
    log('info', 'auto_sync_from_file_cache', { items: cached.items.length });
    return cached;
  }

  // 5) Cache GitHub (fallback distant)
  try {
    const { fetchCache } = require('./github-cache');
    const githubCached = await fetchCache();
    if (githubCached) {
      log('info', 'auto_sync_from_github_cache', { items: githubCached.items.length });
      return githubCached;
    }
  } catch (e) { /* ignore */ }

  log('warn', 'auto_sync_no_data');
  return null;
}

async function syncLoop() {
  if (isSyncing) return;
  isSyncing = true;
  try {
    await sync();
  } finally {
    isSyncing = false;
  }
}

async function initialSync() {
  return sync();
}

function startContinuousSync() {
  if (syncTimer) clearInterval(syncTimer);
  log('info', 'auto_sync_continuous_started', { interval: SYNC_DELAY });
  syncLoop();
  syncTimer = setInterval(syncLoop, SYNC_DELAY);
}

function stopContinuousSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
  isSyncing = false;
}

module.exports = { sync, initialSync, startContinuousSync, stopContinuousSync, loadCache };
