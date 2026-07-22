const { requireAuth, requireCsrf } = require('../lib/auth');
const rateLimit = require('../lib/rateLimit');
const { log } = require('../lib/logger');
const { getCacheDir, safeWriteFile } = require('../lib/cache-dir');
const sharepoint = require('../lib/sharepoint');

module.exports = requireAuth(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST requis' });

  if (!requireCsrf(req, res)) return;

  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (!await rateLimit(ip, 'dashboard-sync', { max: 10, windowMs: 60000 })) {
    return res.status(429).json({ error: 'Trop de requêtes. Réessayez dans 1 minute.' });
  }

  try {
    const { headers, items, syncedAt, source } = req.body;
    if (!headers || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'headers et items requis (items non vide)' });
    }

    // Defense-in-depth : filtrer avant sauvegarde
    let filteredItems = items;
    if (headers && items.length > 0) {
      filteredItems = sharepoint.filterDataRows(items, headers);
    }

    const cache = { headers, items: filteredItems, syncedAt: syncedAt || new Date().toISOString(), source: source || 'api' };

    safeWriteFile(require('path').join(getCacheDir(), 'dash-cache.json'), cache);

    // Also try DB storage if available
    try {
      const db = require('../lib/db');
      await db.query(
        `INSERT INTO dashboard_cache (cache_key, cache_data, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (cache_key) DO UPDATE SET cache_data = $2, updated_at = NOW()`,
        ['sharepoint_suivi_2026', JSON.stringify(cache)]
      );
    } catch (e) { log('warn', 'dashboard_sync_db_write_failed', { error: e?.message }); }

    try {
      const alertManager = require('../lib/alert-manager');
      await alertManager.processDiff(cache);
    } catch (e) {
      log('warn', 'dashboard_sync_diff_alert_failed', { error: e?.message });
    }

    log('info', 'dashboard_sync', { items: filteredItems.length, removed: items.length - filteredItems.length, source: cache.source });

    return res.status(200).json({ success: true, count: filteredItems.length, syncedAt: cache.syncedAt });
  } catch (err) {
    log('error', 'dashboard_sync_error', { error: err.message });
    return res.status(500).json({ error: 'Erreur interne. Réessaie.' });
  }
});
