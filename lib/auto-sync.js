// lib/auto-sync.js
//
// Orchestrateur UNIQUE de synchronisation. Toute la logique d'authentification/fetch
// Microsoft Graph vit désormais dans lib/graph-auth.js + lib/sharepoint.js ; ce module se
// contente d'enchaîner : récupération live -> sauvegarde dans tous les caches partagés
// (Postgres, fichier local, GitHub) -> détection de diff + alerte email -> notification
// temps réel (event bus local). En cas d'échec live, on retombe sur les caches existants.
//
// performSync() est LE point d'entrée, appelé aussi bien par :
//   - la boucle locale (server.mjs, dev/poste local, allowInteractive:true)
//   - l'endpoint /api/sync (cron Vercel + GitHub Actions, allowInteractive:false)
// afin d'avoir un comportement strictement identique partout (plus de divergence entre
// "ce qui tourne en local" et "ce qui tourne en prod").

const path = require('path');
const { log } = require('./logger');
const { CONSTANTS } = require('./constants');
const eventBus = require('./events');
const { getCacheDir, safeWriteFile, safeReadFile } = require('./cache-dir');
const sharepoint = require('./sharepoint');

function cacheFile() { return path.join(getCacheDir(), 'dash-cache.json'); }
const SYNC_DELAY = CONSTANTS.AUTO_SYNC_REFRESH_INTERVAL || 300_000;
let syncTimer = null;
let isSyncing = false;

function saveCache(data) {
  const f = cacheFile();
  if (safeWriteFile(f, data)) {
    log('info', 'auto_sync_cache_saved', { path: f, items: data.items?.length || 0 });
  } else {
    log('error', 'auto_sync_cache_write_failed', { path: f });
  }
}

function loadCache() {
  try {
    const f = cacheFile();
    const raw = safeReadFile(f);
    if (raw) {
      const data = JSON.parse(raw);
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
      let data = r.rows[0].cache_data;
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
    return true;
  } catch (e) { log('warn', 'auto_sync_db_save_failed', { error: e?.message }); return false; }
}

async function tryGithubPublish(data) {
  try {
    const { publishCache } = require('./github-cache');
    await publishCache(data);
  } catch (e) { log('warn', 'auto_sync_github_publish_failed', { error: e && e.message }); }
}

async function runDiffAlert(cacheData) {
  try {
    const diffDetector = require('./diff-detector');
    const emailAlert = require('./email-alert');
    const report = await diffDetector.buildDiffReport(cacheData, cacheData.lastModifiedBy || 'Inconnu');
    if (report) await emailAlert.sendAlert(report);
  } catch (e) { log('warn', 'auto_sync_diff_alert_failed', { error: e && e.message }); }
}

// Alerte "reconnexion nécessaire" — best-effort, throttlée à 1x/24h pour ne pas spammer si
// la panne dure. Ne devrait quasiment jamais se déclencher une fois le cache MSAL persistant
// en place (voir lib/msal-cache-plugin.js) ; sert de filet de sécurité si le refresh token
// est un jour révoqué (changement de mot de passe, politique de sécurité, etc.).
async function maybeAlertReconnectNeeded(reason) {
  const ALERT_KEY = 'sharepoint_reconnect_alert';
  try {
    const db = require('./db');
    const r = await db.query('SELECT cache_data FROM dashboard_cache WHERE cache_key = $1', [ALERT_KEY]);
    const last = r.rows[0] && r.rows[0].cache_data && r.rows[0].cache_data.sentAt;
    if (last && (Date.now() - new Date(last).getTime()) < 24 * 3600 * 1000) return;

    const emailAlert = require('./email-alert');
    const sent = await emailAlert.sendReconnectAlert(reason).catch(() => false);
    if (sent) {
      await db.query(
        `INSERT INTO dashboard_cache (cache_key, cache_data, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (cache_key) DO UPDATE SET cache_data = $2, updated_at = NOW()`,
        [ALERT_KEY, JSON.stringify({ sentAt: new Date().toISOString(), reason })]
      );
    }
  } catch (e) { /* best-effort, on ne bloque jamais le sync pour ça */ }
}

/**
 * Point d'entrée unique de synchronisation.
 * @param {{allowInteractive?: boolean}} [opts] - allowInteractive: autorise un device code
 *   interactif en dernier recours si aucun jeton n'est disponible autrement. À réserver au
 *   script de setup et à la boucle locale — JAMAIS à un appel déclenché par une requête API.
 */
async function performSync(opts) {
  opts = opts || {};

  try {
    const spData = await sharepoint.fetchDashboardData({ allowInteractive: !!opts.allowInteractive });
    if (spData && spData.connected && spData.items && spData.items.length > 0) {
      // Defense-in-depth : re-filtrer même les données live
      let spItems = spData.items
      if (spData.headers && spItems.length > 0) {
        const liveFiltered = sharepoint.filterDataRows(spItems, spData.headers)
        if (liveFiltered.length !== spItems.length) {
          log('info', 'auto_sync_live_filtered', { before: spItems.length, after: liveFiltered.length })
          spItems = liveFiltered
        }
      }
      const cacheData = {
        headers: spData.headers,
        items: spItems,
        syncedAt: new Date().toISOString(),
        source: spData.source || 'live',
        _rawCount: spData._rawCount,
        lastModifiedBy: spData.lastModifiedBy,
      };
      saveCache(cacheData);
      await tryDbSave(cacheData);
      await tryGithubPublish(cacheData);
      await runDiffAlert(cacheData);
      try {
        eventBus.emit('dashboard-updated', {
          source: cacheData.source, items: cacheData.items.length,
          headers: cacheData.headers, syncedAt: cacheData.syncedAt,
        });
      } catch {}
      log('info', 'auto_sync_live', { source: cacheData.source, items: cacheData.items.length });
      return {
        success: true,
        count: cacheData.items.length,
        rawCount: cacheData._rawCount,
        syncedAt: cacheData.syncedAt,
        source: cacheData.source,
        message: cacheData.items.length + ' demandes synchronisées depuis SharePoint',
      };
    }
    if (spData && !spData.connected) {
      log('warn', 'auto_sync_live_unavailable', { reason: spData.message });
      maybeAlertReconnectNeeded(spData.message).catch(() => {});
    }
  } catch (e) {
    log('warn', 'auto_sync_live_failed', { error: e && e.message });
  }

  // ── Repli lecture seule : DB -> fichier local -> GitHub ──
  const dbCached = await loadDbCache();
  if (dbCached) {
    let dbItems = dbCached.items;
    if (dbCached.headers && dbItems && dbItems.length > 0) {
      const filtered = sharepoint.filterDataRows(dbItems, dbCached.headers);
      if (filtered.length !== dbItems.length) {
        log('info', 'auto_sync_db_cache_filtered', { before: dbItems.length, after: filtered.length });
        dbItems = filtered;
        dbCached.items = dbItems;
        saveCache(dbCached);
      }
    }
    await tryDbSave(dbCached);
    return {
      success: true,
      count: dbItems.length,
      rawCount: dbCached._rawCount,
      syncedAt: dbCached.syncedAt,
      source: 'db_cache',
      message: dbItems.length + ' demandes (cache base de données — SharePoint indisponible)',
    };
  }

  const fileCached = loadCache();
  if (fileCached) {
    let fileItems = fileCached.items;
    if (fileCached.headers && fileItems && fileItems.length > 0) {
      const filtered = sharepoint.filterDataRows(fileItems, fileCached.headers);
      if (filtered.length !== fileItems.length) {
        log('info', 'auto_sync_file_cache_filtered', { before: fileItems.length, after: filtered.length });
        fileItems = filtered;
        fileCached.items = fileItems;
        saveCache(fileCached);
      }
    }
    await tryDbSave(fileCached);
    return {
      success: true,
      count: fileItems.length,
      syncedAt: fileCached.syncedAt,
      source: 'file_cache',
      message: fileItems.length + ' demandes (cache local — SharePoint indisponible)',
    };
  }

  try {
    const { fetchCache } = require('./github-cache');
    const githubCached = await fetchCache();
    if (githubCached && githubCached.items && githubCached.items.length > 0) {
      saveCache(githubCached);
      await tryDbSave(githubCached);
      return {
        success: true,
        count: githubCached.items.length,
        rawCount: githubCached._rawCount,
        syncedAt: githubCached.syncedAt,
        source: 'github_cache',
        message: githubCached.items.length + ' demandes (cache GitHub — SharePoint indisponible)',
      };
    }
  } catch (e) { /* ignore */ }

  log('warn', 'auto_sync_no_data');
  return {
    success: false,
    count: 0,
    message: 'Échec synchronisation : aucune donnée disponible (SharePoint injoignable et aucun cache existant)',
  };
}

async function syncLoop() {
  if (isSyncing) return;
  isSyncing = true;
  try {
    await performSync({ allowInteractive: true });
  } finally {
    isSyncing = false;
  }
}

async function initialSync() {
  return performSync({ allowInteractive: true });
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

module.exports = {
  performSync,
  initialSync,
  startContinuousSync,
  stopContinuousSync,
  loadCache,
};
