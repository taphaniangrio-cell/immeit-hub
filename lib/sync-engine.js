const crypto = require('crypto');
const path = require('path');
const { log, updateSyncStatus } = require('./logger');
const { CONSTANTS } = require('./constants');
const eventBus = require('./events');
const { getCacheDir, safeWriteFile, safeReadFile } = require('./cache-dir');
const syncLock = require('./sync-lock');

const CACHE_KEY = 'sharepoint_suivi_2026';

function cacheFile() { return path.join(getCacheDir(), 'dash-cache.json'); }

function computeChecksum(data) {
  const str = JSON.stringify(data.items || []);
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
}

function timeoutPromise(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

async function retryWithBackoff(fn, { retries = 3, baseDelay = 1000, label = 'sync' } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        const delay = baseDelay * Math.pow(2, attempt);
        log('warn', `${label}_retry`, { attempt: attempt + 1, delay, error: err.message });
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

function saveCache(data) {
  const f = cacheFile();
  if (safeWriteFile(f, data)) {
    log('info', 'sync_cache_saved', { path: f, items: data.items?.length || 0 });
    try { require('./github-cache').publishCache(data).catch(() => {}); } catch {}
  } else {
    log('error', 'sync_cache_write_failed', { path: f });
  }
}

function loadCache() {
  try {
    const raw = safeReadFile(cacheFile());
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.headers && data.items) return data;
    }
  } catch (e) { log('warn', 'sync_cache_read_failed', { error: e.message }); }
  return null;
}

async function loadDbCache() {
  try {
    const db = require('./db');
    const r = await timeoutPromise(
      db.query(`SELECT cache_data FROM dashboard_cache WHERE cache_key = $1`, [CACHE_KEY]),
      8000
    );
    if (r.rows.length > 0) {
      let data = r.rows[0].cache_data;
      if (typeof data === 'string') { try { data = JSON.parse(data); } catch {} }
      if (data && data.items && data.items.length > 0) {
        log('info', 'sync_db_cache_loaded', { items: data.items.length, syncedAt: data.syncedAt });
        return data;
      }
    }
  } catch (e) { log('warn', 'sync_db_cache_failed', { error: e.message }); }
  return null;
}

async function saveToDb(data) {
  try {
    const db = require('./db');
    await db.query(
      `INSERT INTO dashboard_cache (cache_key, cache_data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (cache_key) DO UPDATE SET cache_data = $2, updated_at = NOW()`,
      [CACHE_KEY, JSON.stringify(data)]
    );
    log('info', 'sync_db_saved');
    return true;
  } catch (e) {
    log('warn', 'sync_db_save_failed', { error: e.message });
    return false;
  }
}

async function saveAll(data) {
  saveCache(data);
  await saveToDb(data);
}

function emitDashboardUpdated(data) {
  try {
    eventBus.emit('dashboard-updated', {
      source: data.source,
      items: data.items.length,
      headers: data.headers,
      syncedAt: data.syncedAt,
    });
  } catch {}
}

async function fetchLiveClientCredentials() {
  const sharepoint = require('./sharepoint');
  if (!sharepoint.isConfigured()) return null;

  const result = await retryWithBackoff(async () => {
    return await timeoutPromise(sharepoint.fetchDashboardData(), CONSTANTS.SHAREPOINT_HTTPS_TIMEOUT);
  }, { retries: 2, baseDelay: 2000, label: 'sync_cc' });

  if (result && result.connected && result.items?.length > 0) {
    return {
      headers: result.headers,
      items: result.items,
      syncedAt: new Date().toISOString(),
      source: 'client_credentials',
      _rawCount: result._rawCount,
      checksum: null,
    };
  }
  return null;
}

async function fetchLiveDeviceCode() {
  const graphAuth = require('./graph-auth');
  const sharepoint = require('./sharepoint');
  const token = await graphAuth.getGraphToken({ allowInteractive: false });
  if (!token) return null;

  const result = await retryWithBackoff(async () => {
    return await sharepoint.fetchDashboardData({ allowInteractive: false });
  }, { retries: 2, baseDelay: 2000, label: 'sync_dc' });

  return result;
}

async function runDiffAndAlert(data, modifiedBy) {
  try {
    const diffDetector = require('./diff-detector');
    const emailAlert = require('./email-alert');
    const report = await diffDetector.buildDiffReport(data, modifiedBy);
    if (report) await emailAlert.sendAlert(report);
  } catch (e) {
    log('warn', 'sync_diff_alert_failed', { error: e.message });
  }
}

async function executeSync({ source = 'manual', skipLock = false } = {}) {
  const startTime = Date.now();
  const syncId = crypto.randomBytes(4).toString('hex');

  log('info', 'sync_engine_start', { syncId, source });

  if (!skipLock && !syncLock.acquire()) {
    log('info', 'sync_engine_lock_held', { syncId });
    return { success: false, reason: 'lock_held', items: 0 };
  }

  try {
    let data = null;
    let modifiedBy = null;
    let dataSource = null;

    // 1. Client credentials (app-only, fully automated)
    data = await fetchLiveClientCredentials();
    if (data) {
      data.checksum = computeChecksum(data);
      modifiedBy = 'Client Credentials';
      dataSource = 'live';
    }

    // 2. Device code (interactive fallback)
    if (!data) {
      data = await fetchLiveDeviceCode();
      if (data) {
        data.checksum = computeChecksum(data);
        modifiedBy = 'Device Code';
        dataSource = 'live';
      }
    }

    // 3. DB cache
    if (!data) {
      data = await loadDbCache();
      if (data) {
        log('info', 'sync_engine_using_db_cache', { syncId, items: data.items.length });
        dataSource = 'db_cache';
      }
    }

    // 4. File cache
    if (!data) {
      data = loadCache();
      if (data) {
        log('info', 'sync_engine_using_file_cache', { syncId, items: data.items.length });
        dataSource = 'file_cache';
      }
    }

    // 5. GitHub cache
    if (!data) {
      try {
        const { fetchCache } = require('./github-cache');
        data = await fetchCache();
        if (data) {
          log('info', 'sync_engine_using_github_cache', { syncId, items: data.items.length });
          dataSource = 'github_cache';
        }
      } catch {}
    }

    if (!data || !data.items || data.items.length === 0) {
      updateSyncStatus({
        lastError: new Date().toISOString(),
        lastErrorReason: 'no_data_available',
        consecutiveErrors: (syncLock.getLockInfo()?.consecutiveErrors || 0) + 1,
      });
      log('error', 'sync_engine_no_data', { syncId });
      return { success: false, reason: 'no_data', items: 0 };
    }

    // Ensure checksum
    if (!data.checksum) {
      data.checksum = computeChecksum(data);
    }

    // Defense-in-depth : filtrer les données avant sauvegarde quel que soit la source
    if (data.headers && data.items && data.items.length > 0) {
      const sharepoint = require('./sharepoint');
      const filtered = sharepoint.filterDataRows(data.items, data.headers);
      if (filtered.length !== data.items.length) {
        log('info', 'sync_engine_filtered', { before: data.items.length, after: filtered.length, source: dataSource });
        data.items = filtered;
      }
    }

    // Save to all caches
    await saveAll(data);

    // Diff + alert
    await runDiffAndAlert(data, modifiedBy);

    // Broadcast SSE
    emitDashboardUpdated(data);

    const duration = Date.now() - startTime;
    const isLive = dataSource === 'live';
    updateSyncStatus({
      lastSuccess: new Date().toISOString(),
      lastSource: data.source || 'unknown',
      lastDuration: duration,
      lastItemCount: data.items.length,
      lastDataFreshness: isLive ? 'live' : 'cached',
      consecutiveErrors: 0,
      totalSyncs: (getSyncTotal() + 1),
    });

    log('info', 'sync_engine_complete', {
      syncId,
      source: data.source,
      dataSource,
      items: data.items.length,
      rawCount: data._rawCount,
      duration,
      checksum: data.checksum,
    });

    return {
      success: true,
      source: data.source,
      dataSource,
      items: data.items.length,
      rawCount: data._rawCount,
      checksum: data.checksum,
      syncedAt: data.syncedAt,
      duration,
    };
  } catch (err) {
    const duration = Date.now() - startTime;
    updateSyncStatus({
      lastError: new Date().toISOString(),
      lastErrorReason: err.message,
    });
    log('error', 'sync_engine_failed', { syncId, source, error: err.message, duration });
    return { success: false, reason: err.message, items: 0, duration };
  } finally {
    if (!skipLock) syncLock.release();
  }
}

function getSyncTotal() {
  try {
    const status = require('./logger').getSyncStatus();
    return status.totalSyncs || 0;
  } catch { return 0; }
}

module.exports = {
  executeSync,
  loadCache,
  loadDbCache,
  saveCache,
  saveAll,
  computeChecksum,
  emitDashboardUpdated,
  CACHE_KEY,
};
