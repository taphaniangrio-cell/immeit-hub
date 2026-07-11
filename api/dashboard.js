const db = require('../lib/db');
const { requireAuth } = require('../lib/auth');
const { log } = require('../lib/logger');
const cors = require('../lib/cors');
const syncEngine = require('../lib/sync-engine');

const FETCH_TIMEOUT = 30000;

function timeoutPromise(promise, ms) {
  return Promise.race([
    promise,
    new Promise(function(_, reject) {
      setTimeout(function() { reject(new Error('timeout')); }, ms);
    }),
  ]);
}

module.exports = requireAuth(async (req, res) => {
  if (cors(res, req)) return;

  try {
    const [articleStats] = await Promise.all([
      getArticleStats(),
    ]);

    var sharepointData = null;
    var liveSource = null;

    const sharepoint = require('../lib/sharepoint');
    if (sharepoint.isConfigured()) {
      try {
        sharepointData = await timeoutPromise(sharepoint.fetchDashboardData(), FETCH_TIMEOUT);
        if (sharepointData && sharepointData.connected) liveSource = 'client_credentials';
      } catch (e) {
        log('warn', 'dash_sp_clientcreds_failed', { error: e.message });
      }
    }

    if (!sharepointData || !sharepointData.connected) {
      var cached = syncEngine.loadCache();
      if (cached && cached.items && cached.items.length > 0) {
        sharepointData = {
          connected: true,
          headers: cached.headers,
          items: cached.items,
          stats: null,
          lastSync: cached.syncedAt,
          _rawCount: cached._rawCount,
        };
        liveSource = cached.source || 'file_cache';
      }
    }

    if (!sharepointData || !sharepointData.connected) {
      var cachedGit = null;
      try {
        const { fetchCache } = require('../lib/github-cache');
        cachedGit = await fetchCache();
      } catch {}
      if (cachedGit && cachedGit.items && cachedGit.items.length > 0) {
        sharepointData = {
          connected: true,
          headers: cachedGit.headers,
          items: cachedGit.items,
          stats: null,
          lastSync: cachedGit.syncedAt,
          _rawCount: cachedGit._rawCount,
        };
        liveSource = 'github_cache';
      }
    }

    if (!sharepointData || !sharepointData.connected) {
      var cachedDb = null;
      try { cachedDb = await syncEngine.loadDbCache(); } catch {}
      if (cachedDb && cachedDb.items && cachedDb.items.length > 0) {
        sharepointData = {
          connected: true,
          headers: cachedDb.headers,
          items: cachedDb.items,
          stats: null,
          lastSync: cachedDb.syncedAt,
          _rawCount: cachedDb._rawCount,
        };
        liveSource = 'db_cache';
      }
    }

    var displayData;
    if (sharepointData && sharepointData.connected && sharepointData.items?.length > 0) {
      displayData = {
        headers: sharepointData.headers,
        items: sharepointData.items,
        syncedAt: new Date().toISOString(),
        source: liveSource || 'sharepoint_live',
        _rawCount: sharepointData._rawCount,
      };
      syncEngine.saveAll(displayData).catch(function() {});
    } else {
      displayData = null;
    }

    return res.status(200).json({
      articles: articleStats,
      sharepoint: sharepointData && sharepointData.connected
        ? { connected: true, lastSync: sharepointData.lastSync || displayData?.syncedAt }
        : { connected: false },
      synced: displayData,
      freshness: {
        source: liveSource || displayData?.source || 'unknown',
        isLive: liveSource === 'client_credentials' || liveSource === 'device_code',
        syncedAt: displayData?.syncedAt || null,
        itemCount: displayData?.items?.length || 0,
      },
    });
  } catch (err) {
    log('error', 'dashboard_error', { error: err.message });
    return res.status(500).json({ error: 'Erreur chargement tableau de bord' });
  }
});

async function getArticleStats() {
  try {
    const db = require('../lib/db');
    if (!db.isHealthy()) {
      return { total: 0, brouillon: 0, en_revision: 0, valide: 0, publie: 0, archive: 0, termines: 0, tauxCompletion: 0, _dbDown: true };
    }
    var result = await db.query(`
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
    var row = result.rows[0] || {};
    var total = row.total || 0;

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
  } catch (e) {
    log('warn', 'dash_article_stats_failed', { error: e?.message });
    return { total: 0, brouillon: 0, en_revision: 0, valide: 0, publie: 0, archive: 0, termines: 0, tauxCompletion: 0 };
  }
}
