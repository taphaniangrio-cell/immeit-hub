const db = require('../lib/db');
const { requireAuth } = require('../lib/auth');
const { log } = require('../lib/logger');
const cors = require('../lib/cors');
const sharepoint = require('../lib/sharepoint');

const LIVE_TIMEOUT = 15000;

module.exports = requireAuth(async (req, res) => {
  if (cors(res, req)) return;

  try {
    const [articleStats, cachedData] = await Promise.all([
      getArticleStats().catch(e => {
        log('warn', 'dash_article_stats_failed', { error: e.message });
        return { total: 0, brouillon: 0, en_revision: 0, valide: 0, publie: 0, archive: 0, termines: 0, tauxCompletion: 0 };
      }),
      loadCachedData(),
    ]);

    let sharepointData = null;
    let liveSource = null;

    try {
      sharepointData = await timeoutPromise(sharepoint.fetchDashboardData(), LIVE_TIMEOUT);
      if (sharepointData && sharepointData.connected) liveSource = sharepointData.source || 'live';
    } catch (e) {
      log('warn', 'dash_sp_live_failed', { error: e.message });
    }

    let displayData;

    if (sharepointData && sharepointData.connected && sharepointData.items?.length > 0) {
      let liveItems = sharepointData.items;
      if (sharepointData.headers && liveItems.length > 0) {
        const liveFiltered = sharepoint.filterDataRows(liveItems, sharepointData.headers);
        if (liveFiltered.length !== liveItems.length) {
          log('info', 'dash_live_filtered', { before: liveItems.length, after: liveFiltered.length });
          liveItems = liveFiltered;
        }
      }
      displayData = {
        headers: sharepointData.headers,
        items: liveItems,
        syncedAt: new Date().toISOString(),
        source: liveSource || 'sharepoint_live',
        _rawCount: sharepointData._rawCount,
      };
      saveToDBCache(displayData).catch(function() {});
    } else {
      displayData = cachedData;
      if (displayData && displayData.items && displayData.headers && displayData.items.length > 0) {
        const filtered = sharepoint.filterDataRows(displayData.items, displayData.headers);
        if (filtered.length !== displayData.items.length) {
          displayData = { ...displayData, items: filtered, _rawCount: displayData.items.length };
          saveToDBCache(displayData).catch(function() {});
        }
      }
    }

    if (!displayData || !displayData.items || displayData.items.length === 0) {
      log('warn', 'dash_no_data', { live: !!sharepointData?.connected, cached: !!cachedData });
    }

    return res.status(200).json({
      articles: articleStats,
      sharepoint: sharepointData && sharepointData.connected
        ? { connected: true, lastSync: sharepointData.lastSync || displayData?.syncedAt }
        : { connected: false },
      synced: displayData,
    });
  } catch (err) {
    log('error', 'dashboard_error', { error: err.message, stack: err.stack });
    return res.status(500).json({ error: 'Erreur chargement tableau de bord' });
  }
});

function timeoutPromise(promise, ms) {
  return Promise.race([
    promise,
    new Promise(function(_, reject) {
      setTimeout(function() { reject(new Error('timeout')); }, ms);
    }),
  ]);
}

async function saveToDBCache(data) {
  try {
    await db.query(
      `INSERT INTO dashboard_cache (cache_key, cache_data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (cache_key) DO UPDATE SET cache_data = $2, updated_at = NOW()`,
      ['sharepoint_suivi_2026', JSON.stringify(data)]
    );
  } catch (e) { log('warn', 'dash_cache_save_failed', { error: e.message }); }
}

async function loadCachedData() {
  // 1) DB cache
  try {
    const r = await db.query(
      `SELECT cache_data FROM dashboard_cache WHERE cache_key = 'sharepoint_suivi_2026'`
    );
    if (r.rows.length > 0) {
      let data = r.rows[0].cache_data;
      if (typeof data === 'string') { try { data = JSON.parse(data); } catch {} }
      if (data && data.items && data.items.length > 0) return data;
    }
  } catch (e) { log('warn', 'dash_cache_db_read_failed', { error: e?.message }); }

  // 2) GitHub cache (fallback si DB vide/inaccessible)
  try {
    const { fetchCache } = require('../lib/github-cache');
    const gh = await fetchCache();
    if (gh && gh.items && gh.items.length > 0 && gh.headers) {
      log('info', 'dash_github_cache_fallback', { items: gh.items.length });
      return gh;
    }
  } catch (e) { log('warn', 'dash_github_cache_fallback_failed', { error: e?.message }); }

  return null;
}

async function getArticleStats() {
  const result = await db.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE statut = 'brouillon')::int AS brouillon,
      COUNT(*) FILTER (WHERE statut = 'en_revision')::int AS en_revision,
      COUNT(*) FILTER (WHERE statut = 'valide')::int AS valide,
      COUNT(*) FILTER (WHERE statut = 'publie')::int AS publie,
      COUNT(*) FILTER (WHERE statut = 'archive')::int AS archive,
      COUNT(*) FILTER (WHERE statut IN ('valide', 'publie'))::int AS termines
    FROM articles
  `);
  const row = result.rows[0] || {};
  const total = row.total || 0;

  return {
    total: total,
    brouillon: row.brouillon || 0,
    en_revision: row.en_revision || 0,
    valide: row.valide || 0,
    publie: row.publie || 0,
    archive: row.archive || 0,
    termines: row.termines || 0,
    tauxCompletion: total > 0 ? Math.round(((row.termines || 0) / total) * 100) : 0,
  };
}
