const fs = require('fs');
const path = require('path');
const https = require('https');
const { log } = require('./logger');
const { filterDataRows } = require('./sharepoint');
const { CONSTANTS } = require('./constants');
const eventBus = require('./events');

const CACHE_DIR = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, 'IMMEIT')
  : path.join(__dirname, '..', '.immeit-logs');

try { if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch {} // ok if read-only (Vercel)

const CACHE_FILE = path.join(CACHE_DIR, 'dash-cache.json');
const MSAL_CACHE_FILE = path.join(CACHE_DIR, 'msal-cache.json');

const SYNC_DELAY = CONSTANTS.AUTO_SYNC_REFRESH_INTERVAL || 300_000;
let syncTimer = null;
let cachedSiteId = null;
let lastKnownTimestamp = null;
let isSyncing = false;

const SHAREPOINT_HOST = process.env.SHAREPOINT_SITE_HOSTNAME || 'shiftup.sharepoint.com';
const SHAREPOINT_PATH = process.env.SHAREPOINT_SITE_PATH || 'sites/P2M2022';
const FILE_ID = process.env.SHAREPOINT_FILE_ID || '55686017-3ff9-43f7-ab28-5b910871a4b0';
const SHEET_NAME = process.env.SHAREPOINT_SHEET_NAME || 'Suivi Demandes 2026';
const TENANT_ID = process.env.SHAREPOINT_TENANT_ID || 'd852d5cd-724c-4128-8812-ffa5db3f8507';
const CLIENT_ID = process.env.SHAREPOINT_CLIENT_ID || '1950a258-227b-4e31-a9cf-717495945fc2';

function isConfigured() {
  return !!(SHAREPOINT_HOST && SHAREPOINT_PATH && FILE_ID);
}

function isAppOnlyConfigured() {
  return !!(process.env.SHAREPOINT_TENANT_ID && process.env.SHAREPOINT_CLIENT_ID && process.env.SHAREPOINT_CLIENT_SECRET);
}

function isInteractiveConfigured() {
  return !!(TENANT_ID && CLIENT_ID);
}

function saveCache(data) {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data));
    log('info', 'auto_sync_cache_saved', { path: CACHE_FILE, items: data.items?.length || 0 });
  } catch (err) {
    log('error', 'auto_sync_cache_write_failed', { error: err.message });
  }
}

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (data && data.headers && data.items) return data;
    }
  } catch (e) { log('warn', 'auto_sync_cache_read_failed', { error: e?.message }); }
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
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
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

let msalApp = null;
let _tokenCache = { token: null, expiresAt: 0 };

const msalCachePlugin = {
  beforeCacheAccess: async (ctx) => {
    try {
      if (fs.existsSync(MSAL_CACHE_FILE)) {
        ctx.tokenCache.deserialize(fs.readFileSync(MSAL_CACHE_FILE, 'utf-8'));
      }
    } catch (e) { log('warn', 'msal_cache_read_failed', { error: e.message }); }
  },
  afterCacheAccess: async (ctx) => {
    if (ctx.cacheHasChanged) {
      try { fs.writeFileSync(MSAL_CACHE_FILE, ctx.tokenCache.serialize(), 'utf-8'); }
      catch (e) { log('warn', 'msal_cache_write_failed', { error: e.message }); }
    }
  },
};

function getMsalApp() {
  if (msalApp) return msalApp;
  const { PublicClientApplication } = require('@azure/msal-node');
  msalApp = new PublicClientApplication({
    auth: {
      clientId: CLIENT_ID,
      authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    },
    cache: { cachePlugin: msalCachePlugin },
  });
  return msalApp;
}

async function ensureToken() {
  if (_tokenCache.token && _tokenCache.expiresAt > Date.now() + 60000) {
    return _tokenCache.token;
  }
  const app = getMsalApp();
  const accounts = (await app.getTokenCache().getAllAccounts()) || [];

  if (accounts.length > 0) {
    try {
      const resp = await withTimeout(app.acquireTokenSilent({
        scopes: ['https://graph.microsoft.com/.default'],
        account: accounts[0],
      }), 15000);
      _tokenCache = {
        token: resp.accessToken,
        expiresAt: resp.expiresOn ? resp.expiresOn.getTime() : Date.now() + 3600000,
      };
      log('info', 'auto_sync_token_silent', { expiresOn: resp.expiresOn?.toISOString() });
      return resp.accessToken;
    } catch (e) {
      log('warn', 'auto_sync_token_silent_failed', { error: e.message });
    }
  }

  log('info', 'auto_sync_device_code_start');
  const resp = await withTimeout(app.acquireTokenByDeviceCode({
    scopes: ['https://graph.microsoft.com/.default'],
    deviceCodeCallback: (code) => {
      console.log('\n═══════════════════════════════════════════════');
      console.log('  ' + code.message);
      console.log('═══════════════════════════════════════════════\n');
    },
  }), 900_000);

  _tokenCache = {
    token: resp.accessToken,
    expiresAt: resp.expiresOn ? resp.expiresOn.getTime() : Date.now() + 3600000,
  };
  log('info', 'auto_sync_device_code_done', { expiresOn: resp.expiresOn?.toISOString() });
  return resp.accessToken;
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
        try { eventBus.emit('dashboard-updated', { source: 'client_credentials', items: result.items.length, headers: result.headers, syncedAt: cacheData.syncedAt }) } catch {}
        log('info', 'auto_sync_cc_complete', { items: result.items.length });
        return cacheData;
      }
    }
  } catch (e) { log('warn', 'auto_sync_cc_failed', { error: e?.message }); }
  return null;
}

async function fetchFromGraph(token) {
  log('info', 'auto_sync_fetching_site');
  const site = await withTimeout(httpsGet(
    `https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_HOST}:/${SHAREPOINT_PATH}`, token
  ), 15000);
  cachedSiteId = site.id;

  log('info', 'auto_sync_fetching_workbook');
  let driveItem;
  try {
    driveItem = await withTimeout(httpsGet(
      `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${FILE_ID}?select=id,lastModifiedBy,lastModifiedDateTime`, token
    ), 15000);
  } catch {
    const search = await withTimeout(httpsGet(
      `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/root/search(q='${SHEET_NAME}')`, token
    ), 15000);
    if (!search.value?.length) throw new Error('Fichier introuvable');
    driveItem = search.value[0];
  }

  const itemId = driveItem.id;
  const lastModifiedBy = driveItem.lastModifiedBy?.user?.displayName || 'Inconnu';
  lastKnownTimestamp = driveItem.lastModifiedDateTime || '';

  const sheetData = await withTimeout(httpsGet(
    `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${itemId}/workbook/worksheets('${encodeURIComponent(SHEET_NAME)}')/usedRange`, token
  ), 30000);

  const rows = sheetData.values || [];
  if (rows.length < 2) throw new Error('Pas assez de donnees');

  const headers = rows[0];
  const allItems = rows.slice(1).map((row, idx) => {
    const obj = { _row: idx + 2 };
    headers.forEach((h, i) => {
      const key = String(h).toLowerCase().trim().replace(/[\s\/]+/g, '_').replace(/[^a-z0-9_]/g, '');
      obj[key] = row[i] != null ? String(row[i]).trim() : '';
    });
    return obj;
  });
  const items = filterDataRows(allItems, headers);

  const cacheData = { headers, items, syncedAt: new Date().toISOString(), source: 'auto_sync', _rawCount: allItems.length };
  saveCache(cacheData);
  tryDbSave(cacheData);

  try {
    const diffDetector = require('./diff-detector');
    const emailAlert = require('./email-alert');
    const report = diffDetector.buildDiffReport(cacheData, lastModifiedBy);
    if (report) await emailAlert.sendAlert(report);
  } catch (e) { log('warn', 'auto_sync_diff_alert_failed', { error: e?.message }); }

  log('info', 'auto_sync_complete', { raw: allItems.length, filtered: items.length });
  try { eventBus.emit('dashboard-updated', { source: 'auto_sync', items: items.length, headers, syncedAt: cacheData.syncedAt }) } catch {}
  return cacheData;
}

async function sync() {
  if (isAppOnlyConfigured()) {
    const fresh = await tryClientCredentials();
    if (fresh) return fresh;
  }
  if (isInteractiveConfigured()) {
    try {
      const token = await withTimeout(ensureToken(), 910000);
      if (cachedSiteId && lastKnownTimestamp) {
        try {
          const di = await withTimeout(httpsGet(
            `https://graph.microsoft.com/v1.0/sites/${cachedSiteId}/drive/items/${FILE_ID}?select=lastModifiedDateTime`, token
          ), 10000);
          if (di.lastModifiedDateTime === lastKnownTimestamp) {
            log('info', 'auto_sync_unchanged');
            const cached = loadCache();
            if (cached) return cached;
          }
        } catch {}
      }
      return await fetchFromGraph(token);
    } catch (e) {
      log('warn', 'auto_sync_token_failed', { error: e.message });
    }
  }
  const cached = loadCache();
  return cached || null;
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
