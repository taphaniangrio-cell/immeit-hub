const { generateArticle } = require('../lib/ai-client');
const { findImagesForArticle } = require('../lib/image-fetcher');
const rateLimit = require('../lib/rateLimit');
const sanitizeInput = require('../lib/sanitize');
const { requireAuth } = require('../lib/auth');
const { log } = require('../lib/logger');
const cors = require('../lib/cors');

module.exports = requireAuth(async (req, res) => {
  if (cors(res, req)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (!rateLimit(ip, 'generate', { max: 5, windowMs: 60_000 })) {
    return res.status(429).json({ error: 'Trop de requêtes. Réessaie dans 1 minute.' });
  }

  try {
    const { news, feedback, provider, model, customPrompt } = req.body;

    if (!customPrompt && (!news || !news.titre)) {
      return res.status(400).json({ error: 'Actualité source ou sujet libre requis' });
    }

    if (customPrompt && customPrompt.trim().length < 3) {
      return res.status(400).json({ error: 'Sujet trop court (min. 3 caractères)' });
    }

    const sanitizedPrompt = customPrompt ? sanitizeInput(customPrompt) : null;

    const resolvedProvider = provider || 'groq';
    const resolvedModel = model || null;
    const generationType = sanitizedPrompt ? 'custom' : 'news';

    const [article, images] = await Promise.all([
      generateArticle(news, feedback || '', resolvedProvider, resolvedModel, sanitizedPrompt || null),
      findImagesForArticle({
        titre_interne: sanitizedPrompt || news?.titre || '',
        hashtags: [],
        corps: news?.resume || sanitizedPrompt || '',
        image_keywords: null,
      }),
    ]);

    const primary = images[0] || null;

    log('info', 'article_generated', { provider: resolvedProvider, model: resolvedModel, type: generationType });

    return res.status(200).json({
      article: { ...article, image_url: primary?.url || null, image_photographer: primary?.photographer || null, image_photographer_url: primary?.photographer_url || null, image_options: images },
      ia: {
        provider: resolvedProvider,
        model: resolvedModel || (article._modelUsed || null),
        generation_type: generationType,
        custom_subject: sanitizedPrompt || null,
      }
    });
  } catch (err) {
    log('error', 'generate_error', { error: err.message });
    if (err.message === 'QUOTA') {
      return res.status(429).json({ error: 'Quota API dépassé. Réessaie plus tard ou change de fournisseur.' });
    }
    if (err.message === 'CLÉ_INVALIDE') {
      return res.status(401).json({ error: 'Clé API invalide pour ce fournisseur.' });
    }
    if (err.message.includes('Crédits insuffisants')) {
      return res.status(402).json({ error: err.message });
    }
    if (err.message.includes('indisponible')) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message || 'Erreur interne. Réessaie.' });
  }
});
