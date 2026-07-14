const db = require('../lib/db');
const { requireAuth } = require('../lib/auth');
const { log } = require('../lib/logger');
const cors = require('../lib/cors');
const sharepoint = require('../lib/sharepoint');

const LIVE_TIMEOUT = 30000;

module.exports = requireAuth(async (req, res) => {
  if (cors(res, req)) return;

  try {
    const [articleStats, cachedData] = await Promise.all([
      getArticleStats(),
      loadCachedData(),
    ]);

    const MAX_CACHE_AGE_MS = 60 * 1000; // 1 minute
    let isCacheFresh = false;
    let displayData = cachedData;

    if (cachedData && cachedData.syncedAt) {
      const age = Date.now() - new Date(cachedData.syncedAt).getTime();
      if (age < MAX_CACHE_AGE_MS) {
        isCacheFresh = true;
      }
    }

    if (!displayData || !displayData.items || displayData.items.length === 0) {
      // Pas de cache du tout, on attend une synchronisation live bloquante
      // (Ceci ne devrait normalement jamais arriver en production)
      const sharepointData = await timeoutPromise(sharepoint.fetchDashboardData(), LIVE_TIMEOUT);
      if (sharepointData && sharepointData.items?.length > 0) {
        displayData = {
          headers: sharepointData.headers,
          items: sharepointData.items,
          syncedAt: new Date().toISOString(),
          source: sharepointData.source || 'sharepoint_live',
        };
        await saveToDBCache(displayData);
      }
    } else {
      // Filtrer les données du cache avant de les envoyer
      if (displayData.items && displayData.headers && displayData.items.length > 0) {
        const filtered = sharepoint.filterDataRows(displayData.items, displayData.headers);
        if (filtered.length !== displayData.items.length) {
          displayData = { ...displayData, items: filtered, _rawCount: displayData.items.length };
        }
      }
    }

    if (!displayData || !displayData.items || displayData.items.length === 0) {
      log('warn', 'dash_no_data', { cached: !!cachedData });
    }

    return res.status(200).json({
      articles: articleStats,
      sharepoint: { connected: true, lastSync: displayData?.syncedAt },
      synced: displayData,
      needsBackgroundSync: !isCacheFresh
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
  const DB_TIMEOUT = 10000;

  const dbPromise = (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await Promise.race([
          db.query(`SELECT cache_data FROM dashboard_cache WHERE cache_key = 'sharepoint_suivi_2026'`),
          new Promise((_, rej) => setTimeout(() => rej(new Error('db_cache_timeout')), DB_TIMEOUT)),
        ]);
        if (r.rows.length > 0) {
          let data = r.rows[0].cache_data;
          if (typeof data === 'string') { try { data = JSON.parse(data); } catch {} }
          if (data && data.items && data.items.length > 0) return data;
        }
        break;
      } catch (e) {
        log('warn', 'dash_cache_db_read_failed', { error: e?.message, attempt });
        if (attempt < 1) await new Promise(r => setTimeout(r, 500));
      }
    }
    return null;
  })();

  const ghPromise = (async () => {
    try {
      const { fetchCache } = require('../lib/github-cache');
      const gh = await fetchCache();
      if (gh && gh.items && gh.items.length > 0 && gh.headers) {
        return gh;
      }
    } catch (e) { log('warn', 'dash_github_cache_fallback_failed', { error: e?.message }); }
    return null;
  })();

  const [dbData, ghData] = await Promise.all([dbPromise, ghPromise]);

  if (dbData) {
    log('info', 'dash_cache_db_hit', { items: dbData.items.length });
    return dbData;
  }
  if (ghData) {
    log('info', 'dash_github_cache_fallback', { items: ghData.items.length });
    return ghData;
  }
  return null;
}

async function getArticleStats() {
  try {
    const result = await Promise.race([
      db.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE statut = 'brouillon')::int AS brouillon,
          COUNT(*) FILTER (WHERE statut = 'en_revision')::int AS en_revision,
          COUNT(*) FILTER (WHERE statut = 'valide')::int AS valide,
          COUNT(*) FILTER (WHERE statut = 'publie')::int AS publie,
          COUNT(*) FILTER (WHERE statut = 'archive')::int AS archive,
          COUNT(*) FILTER (WHERE statut IN ('valide', 'publie'))::int AS termines
        FROM articles
      `),
      new Promise((_, rej) => setTimeout(() => rej(new Error('stats_timeout')), 5000)),
    ]);
    const row = result.rows[0] || {};
    const total = row.total || 0;
    return {
      total,
      brouillon: row.brouillon || 0,
      en_revision: row.en_revision || 0,
      valide: row.valide || 0,
      publie: row.publie || 0,
      archive: row.archive || 0,
      termines: row.termines || 0,
      tauxCompletion: total > 0 ? Math.round(((row.termines || 0) / total) * 100) : 0,
    };
  } catch {
    return { total: 0, brouillon: 0, en_revision: 0, valide: 0, publie: 0, archive: 0, termines: 0, tauxCompletion: 0 };
  }
}
