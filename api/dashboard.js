const db = require('../lib/db');
const { requireAuth } = require('../lib/auth');
const { log } = require('../lib/logger');
const cors = require('../lib/cors');
const sharepoint = require('../lib/sharepoint');
const autoSync = require('../lib/auto-sync');
const { getCacheDir, safeReadFile } = require('../lib/cache-dir');

const FETCH_TIMEOUT = 30000;

module.exports = requireAuth(async (req, res) => {
  if (cors(res, req)) return;

  try {
    const [articleStats, cachedData] = await Promise.all([
      getArticleStats(),
      loadCachedData(),
    ]);

    var sharepointData = null
    var liveSource = null

    // 1) Try client_credentials (app-only) — works on Vercel, no popup
    if (sharepoint.isConfigured()) {
      try {
        sharepointData = await timeoutPromise(sharepoint.fetchDashboardData(), FETCH_TIMEOUT)
        if (sharepointData && sharepointData.connected) liveSource = 'client_credentials'
      } catch (e) {
        log('warn', 'dash_sp_clientcreds_failed', { error: e.message })
      }
    }

    // 2) Fallback: try cache
    if (!sharepointData || !sharepointData.connected) {
      try {
        var cached = autoSync.loadCache()
        if (cached && cached.items && cached.items.length > 0) {
          sharepointData = {
            connected: true,
            headers: cached.headers,
            items: cached.items,
            stats: null,
            lastSync: cached.syncedAt,
            _rawCount: cached._rawCount,
          }
          liveSource = cached.source || 'cache'
        }
      } catch (e) {
        log('warn', 'dash_sp_cache_fallback_failed', { error: e.message })
      }
    }

    var displayData
    if (sharepointData && sharepointData.connected && sharepointData.items?.length > 0) {
      displayData = {
        headers: sharepointData.headers,
        items: sharepointData.items,
        syncedAt: new Date().toISOString(),
        source: liveSource || 'sharepoint_live',
        _rawCount: sharepointData._rawCount,
      }
      saveToDBCache(displayData).catch(function() {})
    } else {
      displayData = cachedData
    }

    return res.status(200).json({
      articles: articleStats,
      sharepoint: sharepointData && sharepointData.connected
        ? { connected: true, lastSync: sharepointData.lastSync || displayData?.syncedAt }
        : { connected: false },
      synced: displayData,
    })
  } catch (err) {
    log('error', 'dashboard_error', { error: err.message })
    return res.status(500).json({ error: 'Erreur chargement tableau de bord' })
  }
})

function timeoutPromise(promise, ms) {
  return Promise.race([
    promise,
    new Promise(function(_, reject) {
      setTimeout(function() { reject(new Error('timeout')) }, ms)
    }),
  ])
}

async function saveToDBCache(data) {
  try {
    await db.query(
      `INSERT INTO dashboard_cache (cache_key, cache_data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (cache_key) DO UPDATE SET cache_data = $2, updated_at = NOW()`,
      ['sharepoint_suivi_2026', JSON.stringify(data)]
    )
  } catch (e) { log('warn', 'dash_cache_save_failed', { error: e.message }) }
}

async function loadCachedData() {
  try {
    const r = await db.query(
      `SELECT cache_data FROM dashboard_cache WHERE cache_key = 'sharepoint_suivi_2026'`
    )
    if (r.rows.length > 0) {
      var data = r.rows[0].cache_data
      if (typeof data === 'string') { try { data = JSON.parse(data) } catch {} }
      if (data && data.items && data.items.length > 0) return data
    }
  } catch (e) { log('warn', 'dash_cache_db_read_failed', { error: e?.message }) }

  try {
    var cached = autoSync.loadCache()
    if (cached && cached.items && cached.items.length > 0) return cached
  } catch (e) { /* ignore */ }

  try {
    var raw = safeReadFile(require('path').join(getCacheDir(), 'dash-cache.json'))
    if (raw) return JSON.parse(raw)
  } catch (e) { /* ignore */ }

  try {
    const { fetchCache } = require('../lib/github-cache');
    var githubCached = await fetchCache();
    if (githubCached && githubCached.items && githubCached.items.length > 0) return githubCached;
  } catch (e) { /* ignore */ }

  return null
}

async function getArticleStats() {
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
  `)
  var row = result.rows[0] || {}
  var total = row.total || 0

  return {
    total: total,
    brouillon: row.brouillon || 0,
    en_revision: row.en_revision || 0,
    valide: row.valide || 0,
    publie: row.publie || 0,
    archive: row.archive || 0,
    termines: row.termines || 0,
    tauxCompletion: total > 0 ? Math.round(((row.termines || 0) / total) * 100) : 0,
  }
}
