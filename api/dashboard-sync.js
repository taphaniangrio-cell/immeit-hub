const { requireAuth } = require('../lib/auth');
const { log } = require('../lib/logger');
const { getCacheDir, safeWriteFile } = require('../lib/cache-dir');
const sharepoint = require('../lib/sharepoint');

module.exports = requireAuth(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST requis' });

  try {
    const { headers, items, syncedAt, source } = req.body;
    if (!headers || !items) return res.status(400).json({ error: 'headers et items requis' });

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

    log('info', 'dashboard_sync', { items: items.length, source: cache.source });

    return res.status(200).json({ success: true, count: items.length, syncedAt: cache.syncedAt });
  } catch (err) {
    log('error', 'dashboard_sync_error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});
