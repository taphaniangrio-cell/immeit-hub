const rateLimit = require('../lib/rateLimit');
const { requireAuth } = require('../lib/auth');
const cors = require('../lib/cors');

module.exports = requireAuth(async (req, res) => {
  if (cors(res, req)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (!rateLimit(ip, 'images', { max: 30, windowMs: 60_000 })) {
    return res.status(429).json({ error: 'Trop de requêtes. Réessaie dans 1 minute.' });
  }

  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'PEXELS_API_KEY non configurée' });
  }

  const q = (req.query.query || '').trim();
  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Requête trop courte' });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=6&orientation=landscape`;
    const response = await fetch(url, {
      headers: { Authorization: apiKey },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(502).json({ error: 'Erreur API Pexels' });
    }

    const data = await response.json();
    const photos = (data.photos || []).map(p => ({
      url: p.src.large || p.src.medium,
      thumbnail: p.src.small || p.src.tiny,
      photographer: p.photographer,
      photographer_url: p.photographer_url,
      alt: p.alt || '',
    }));

    return res.status(200).json({ photos });
  } catch {
    return res.status(502).json({ error: 'Erreur réseau Pexels' });
  }
});
