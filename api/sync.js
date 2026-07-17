const cors = require('../lib/cors');
const { requireAuth } = require('../lib/auth');
const { log } = require('../lib/logger');
const autoSync = require('../lib/auto-sync');

async function isCronAuthorized(req) {
  if (req.headers['x-vercel-cron'] === '1') return true;
  const auth = req.headers['authorization'] || '';
  const secret = process.env.CRON_SECRET || process.env.GITHUB_TOKEN;
  if (auth.startsWith('Bearer ') && secret && auth.slice(7) === secret) return true;
  return false;
}

module.exports = async (req, res) => {
  if (cors(res, req)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST requis' });
  }

  if (!await isCronAuthorized(req)) {
    return requireAuth(async (req2, res2) => {
      await handleSync(req2, res2);
    })(req, res);
  }

  await handleSync(req, res);
};

async function handleSync(req, res) {
  // Réponse immédiate avec le cache dispo avant de lancer le sync live
  const cached = autoSync.loadCache();
  if (cached) {
    res.status(200).json({
      success: true,
      count: cached.items?.length || 0,
      syncedAt: cached.syncedAt,
      source: 'cache',
      message: 'Sync lancé — mise à jour dans quelques instants',
    });
  } else {
    res.status(200).json({ success: true, count: 0, message: 'Sync lancé' });
  }

  // Sync live en arrière-plan (ne bloque pas la réponse)
  autoSync.performSync().catch(err => {
    log('error', 'sync_background_failed', { error: err && err.message });
  });
}
