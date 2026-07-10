const path = require('path');
const { log } = require('./logger');
const { CONSTANTS } = require('./constants');
const eventBus = require('./events');
const { getCacheDir, safeWriteFile, safeReadFile } = require('./cache-dir');

function cacheFile() { return path.join(getCacheDir(), 'dash-cache.json'); }
const SYNC_DELAY = CONSTANTS.AUTO_SYNC_REFRESH_INTERVAL || 300_000;
let syncTimer = null;
let isSyncing = false;

function isAppOnlyConfigured() {
  return !!(process.env.SHAREPOINT_TENANT_ID && process.env.SHAREPOINT_CLIENT_ID && process.env.SHAREPOINT_CLIENT_SECRET);
}

function saveCache(data) {
  var f = cacheFile();
  if (safeWriteFile(f, data)) {
    log('info', 'auto_sync_cache_saved', { path: f, items: data.items?.length || 0 });
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

async function sync() {
  // 1) Client credentials (app-only) — fully automated, zéro intervention humaine
  if (isAppOnlyConfigured()) {
    const fresh = await tryClientCredentials();
    if (fresh) {
      log('info', 'auto_sync_live', { source: 'client_credentials', items: fresh.items.length });
      return fresh;
    }
  }

  // 2) Cache base de données — alimenté par Vercel (prod), toujours frais
  const dbCached = await loadDbCache();
  if (dbCached) {
    log('info', 'auto_sync_from_db_cache', { items: dbCached.items.length, syncedAt: dbCached.syncedAt });
    return dbCached;
  }

  // 3) Cache fichier local — dernier recours
  const cached = loadCache();
  if (cached) {
    log('info', 'auto_sync_from_file_cache', { items: cached.items.length });
    return cached;
  }

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
