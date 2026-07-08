const fs = require('fs');
const path = require('path');
const https = require('https');
const { log } = require('./logger');
const { filterDataRows } = require('./sharepoint');
const { CONSTANTS } = require('./constants');
const eventBus = require('./events');

const CACHE_FILE = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, 'IMMEIT', 'dash-cache.json')
  : path.join(__dirname, '..', '.immeit-logs', 'dash-cache.json');

const REFRESH_INTERVAL = CONSTANTS.AUTO_SYNC_REFRESH_INTERVAL;
const SYNC_DELAY = 300_000;
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
const CLIENT_SECRET = process.env.SHAREPOINT_CLIENT_SECRET;

let credential = null;

function isConfigured() {
  return !!(SHAREPOINT_HOST && SHAREPOINT_PATH && FILE_ID);
}

function isInteractiveConfigured() {
  return !!(TENANT_ID && CLIENT_ID);
}

function isAppOnlyConfigured() {
  return !!(TENANT_ID && CLIENT_ID && CLIENT_SECRET);
}

function getCredential() {
  if (!isInteractiveConfigured()) return null;
  if (!credential) {
    const { DeviceCodeCredential } = require('@azure/identity');
    credential = new DeviceCodeCredential({
      tenantId: TENANT_ID,
      clientId: CLIENT_ID,
      tokenCachePersistenceOptions: {
        name: 'immeit-sp-cache',
      },
      userPromptCallback: (info) => {
        console.log('');
        console.log('  ═══════════════════════════════════════════════');
        console.log('  Connexion SharePoint requise');
        console.log('  ═══════════════════════════════════════════════');
        console.log(`  ${info.message}`);
        console.log('  ═══════════════════════════════════════════════');
        console.log('');
      },
    });
  }
  return credential;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]);
}

let _tokenPromise = null
async function ensureToken() {
  if (_tokenPromise) return _tokenPromise
  const cred = getCredential();
  if (!cred) throw new Error('Auth interactive non configurée (SHAREPOINT_TENANT_ID requis)');
  _tokenPromise = (async () => {
    try {
      const resp = await cred.getToken('https://graph.microsoft.com/.default');
      log('info', 'auto_sync_token_acquired', { expiresOn: resp.expiresOn?.toISOString() });
      return resp.token;
    } catch (err) {
      log('warn', 'auto_sync_token_failed', { error: err.message, type: err.constructor?.name });
      _tokenPromise = null
      throw err;
    }
  })()
  return _tokenPromise
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

async function fetchSharePointData() {
  let token;
  try {
    token = await ensureToken();
  } catch (err) {
    log('warn', 'auto_sync_token_failed', { error: err.message });
    return null;
  }

  try {
    log('info', 'auto_sync_fetching_site');
    const site = await httpsGet(
      `https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_HOST}:/${SHAREPOINT_PATH}`,
      token
    );
    const siteId = site.id;
    cachedSiteId = siteId;

    log('info', 'auto_sync_fetching_workbook');
    let driveItem;
    try {
      driveItem = await httpsGet(
        `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${FILE_ID}?select=id,lastModifiedBy,lastModifiedDateTime`,
        token
      );
    } catch {
      const search = await httpsGet(
        `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root/search(q='Suivi Demandes 2026')`,
        token
      );
      const items = search.value || [];
      if (items.length === 0) throw new Error('Fichier introuvable');
      driveItem = items[0];
    }

    const itemId = driveItem.id;
    const lastModifiedBy = driveItem.lastModifiedBy?.user?.displayName || 'Inconnu';
    const lastModifiedAt = driveItem.lastModifiedDateTime || '';
    lastKnownTimestamp = lastModifiedAt;

    const sheetData = await httpsGet(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${itemId}/workbook/worksheets('${encodeURIComponent(SHEET_NAME)}')/usedRange`,
      token
    );

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
      if (report) {
        await emailAlert.sendAlert(report);
      }
    } catch (e) {
      log('warn', 'auto_sync_diff_alert_failed', { error: e?.message });
    }

    log('info', 'auto_sync_complete', { raw: allItems.length, filtered: items.length });

    try { eventBus.emit('dashboard-updated', { source: 'auto_sync', items: items.length, headers, syncedAt: cacheData.syncedAt }) } catch {}
    return cacheData;
  } catch (err) {
    log('error', 'auto_sync_fetch_failed', { error: err.message });
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
        try { eventBus.emit('dashboard-updated', { source: 'client_credentials', items: result.items.length, headers: result.headers, syncedAt: cacheData.syncedAt }) } catch {}
        log('info', 'auto_sync_cc_complete', { items: result.items.length });
        return true;
      }
    }
  } catch (e) { /* silent — client_credentials non configure */ }
  return false;
}

async function sync() {
  const data = await fetchSharePointData();
  if (data) return data;
  const cached = loadCache();
  return cached || null;
}

async function syncLoop() {
  if (isSyncing) return;
  isSyncing = true;
  try {
    if (isAppOnlyConfigured()) {
      if (await tryClientCredentials()) return;
    }
    try {
      const token = await ensureToken();
      if (await quickCheck(token)) return;
      await fetchAndProcess(token);
    } catch (e) {
      log('warn', 'auto_sync_loop_error', { error: e?.message || e });
    }
  } finally {
    isSyncing = false;
  }
}

async function initialSync() {
  if (isAppOnlyConfigured()) {
    if (await tryClientCredentials()) {
      const cached = loadCache();
      return cached || null;
    }
  }
  const data = await sync();
  if (data) return data;
  const cached = loadCache();
  return cached || null;
}

async function quickCheck(token) {
  try {
    if (!cachedSiteId) {
      log('info', 'auto_sync_fetching_site');
      const site = await withTimeout(httpsGet(
        `https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_HOST}:/${SHAREPOINT_PATH}`,
        token
      ), 15000);
      cachedSiteId = site.id;
    }
    const driveItem = await withTimeout(httpsGet(
      `https://graph.microsoft.com/v1.0/sites/${cachedSiteId}/drive/items/${FILE_ID}?select=id,lastModifiedBy,lastModifiedDateTime`,
      token
    ), 15000);
    const ts = driveItem.lastModifiedDateTime;
    if (ts && lastKnownTimestamp === ts) {
      log('info', 'auto_sync_unchanged');
      return true;
    }
    lastKnownTimestamp = ts;
    return false;
  } catch (err) {
    log('warn', 'auto_sync_quick_check_failed', { error: err.message });
    return false;
  }
}

async function fetchAndProcess(token) {
  try {
    const siteId = cachedSiteId;
    let driveItem;
    try {
      driveItem = await withTimeout(httpsGet(
        `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${FILE_ID}?select=id,lastModifiedBy,lastModifiedDateTime`,
        token
      ), 15000);
    } catch {
      const search = await withTimeout(httpsGet(
        `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root/search(q='Suivi Demandes 2026')`,
        token
      ), 15000);
      const items = search.value || [];
      if (items.length === 0) throw new Error('Fichier introuvable');
      driveItem = items[0];
    }

    const itemId = driveItem.id;
    const lastModifiedBy = driveItem.lastModifiedBy?.user?.displayName || 'Inconnu';
    const lastModifiedAt = driveItem.lastModifiedDateTime || '';

    log('info', 'auto_sync_fetching_workbook');
    const sheetData = await withTimeout(httpsGet(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${itemId}/workbook/worksheets('${encodeURIComponent(SHEET_NAME)}')/usedRange`,
      token
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
      if (report) {
        await emailAlert.sendAlert(report);
      }
    } catch (e) {
      log('warn', 'auto_sync_diff_alert_failed', { error: e?.message });
    }

    log('info', 'auto_sync_complete', { raw: allItems.length, filtered: items.length });

    try { eventBus.emit('dashboard-updated', { source: 'auto_sync', items: items.length, headers, syncedAt: cacheData.syncedAt }) } catch {}
    return cacheData;
  } catch (err) {
    log('error', 'auto_sync_fetch_failed', { error: err.message });
    return null;
  }
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

module.exports = { sync, initialSync, startContinuousSync, stopContinuousSync, loadCache, fetchSharePointData, ensureToken };
