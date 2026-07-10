const sharepoint = require('../lib/sharepoint');
const cors = require('../lib/cors');
const { requireAuth } = require('../lib/auth');
const { log } = require('../lib/logger');
const db = require('../lib/db');
const { getCacheDir, safeWriteFile } = require('../lib/cache-dir');

async function saveToDB(data) {
  try {
    await db.query(
      `INSERT INTO dashboard_cache (cache_key, cache_data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (cache_key) DO UPDATE SET cache_data = $2, updated_at = NOW()`,
      ['sharepoint_suivi_2026', JSON.stringify(data)]
    );
    return true;
  } catch (e) { log('warn', 'sync_db_save_failed', { error: e.message }); }
  return false;
}

function saveToFileCache(data) {
  try {
    safeWriteFile(require('path').join(getCacheDir(), 'dash-cache.json'), data);
  } catch (e) { log('warn', 'sync_file_save_failed', { error: e.message }); }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout (' + (ms / 1000) + 's)')), ms))
  ]);
}

module.exports = requireAuth(async (req, res) => {
  if (cors(res, req)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST requis' });
  }

  // 1. Direct client_credentials fetch (works on Vercel + local if env vars set)
  if (sharepoint.isConfigured()) {
    try {
      log('info', 'sync_start', { method: 'client_credentials' });
      const spData = await withTimeout(sharepoint.fetchDashboardData(), 45000);
      if (spData && spData.connected && spData.items && spData.items.length > 0) {
        const cacheData = { headers: spData.headers, items: spData.items, syncedAt: new Date().toISOString(), source: 'sharepoint_client_credentials', _rawCount: spData._rawCount };
        await saveToDB(cacheData);
        saveToFileCache(cacheData);
        try {
          const eventBus = require('../lib/events');
          eventBus.emit('dashboard-updated', { source: 'sync_button', items: spData.items.length, syncedAt: cacheData.syncedAt });
        } catch {}
        log('info', 'sync_complete', { items: spData.items.length, source: 'client_credentials' });
        return res.status(200).json({
          success: true,
          count: spData.items.length,
          rawCount: spData._rawCount,
          syncedAt: cacheData.syncedAt,
          source: 'sharepoint_client_credentials',
          message: spData.items.length + ' demandes synchronisées depuis SharePoint',
        });
      }
      log('warn', 'sync_sp_no_data', { connected: spData?.connected, itemCount: spData?.items?.length || 0 });
    } catch (e) {
      log('warn', 'sync_sp_failed', { error: e.message });
    }
  }

  // 2. Fallback: DB cache
  try {
    const r = await db.query("SELECT cache_data FROM dashboard_cache WHERE cache_key = 'sharepoint_suivi_2026'");
    if (r.rows.length > 0) {
      var dbCache = r.rows[0].cache_data;
      if (typeof dbCache === 'string') { try { dbCache = JSON.parse(dbCache); } catch {} }
      if (dbCache && dbCache.items && dbCache.items.length > 0) {
        log('info', 'sync_fallback_db_cache', { items: dbCache.items.length });
        return res.status(200).json({
          success: true,
          count: dbCache.items.length,
          rawCount: dbCache._rawCount,
          syncedAt: dbCache.syncedAt,
          source: 'db_cache',
          message: dbCache.items.length + ' demandes (cache base de données — SharePoint indisponible)',
        });
      }
    }
  } catch (e) { log('warn', 'sync_db_cache_failed', { error: e.message }); }

  // 3. Fallback: local file cache
  try {
    var cached = require('../lib/auto-sync').loadCache();
    if (cached && cached.items && cached.items.length > 0) {
      log('info', 'sync_fallback_file_cache', { items: cached.items.length });
      return res.status(200).json({
        success: true,
        count: cached.items.length,
        syncedAt: cached.syncedAt,
        source: 'file_cache',
        message: cached.items.length + ' demandes (cache local — SharePoint indisponible)',
      });
    }
  } catch (e) {}

  // 4. Nothing available
  var reason = !sharepoint.isConfigured()
    ? 'Variables SharePoint non configurées (SHAREPOINT_TENANT_ID, SHAREPOINT_CLIENT_ID, SHAREPOINT_CLIENT_SECRET)'
    : 'Impossible de contacter SharePoint — vérifie les credentials et la connectivité';
  log('error', 'sync_no_data', { reason });
  return res.status(200).json({
    success: false,
    count: 0,
    message: 'Échec synchronisation : ' + reason,
  });
});
