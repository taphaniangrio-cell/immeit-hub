const { fetchNews } = require('../lib/rss-fetcher');
const rateLimit = require('../lib/rateLimit');
const { requireAuth } = require('../lib/auth');
const { log } = require('../lib/logger');
const cors = require('../lib/cors');
const { CONSTANTS } = require('../lib/constants');

module.exports = requireAuth(async (req, res) => {
  if (cors(res, req)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (!await rateLimit(ip, 'news', CONSTANTS.RATE_LIMIT_NEWS)) {
    return res.status(429).json({ error: 'Trop de requêtes. Réessaie dans 1 minute.' });
  }

  try {
    const news = await fetchNews();
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    return res.status(200).json({ news });
  } catch (err) {
    log('error', 'news_error', { error: err.message });
    return res.status(500).json({ error: 'Erreur lors du chargement des actualités.' });
  }
});
