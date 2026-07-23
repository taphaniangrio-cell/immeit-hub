const { generateArticle } = require('../lib/ai-client');
const { findImagesForArticle } = require('../lib/image-fetcher');
const rateLimit = require('../lib/rateLimit');
const sanitizeInput = require('../lib/sanitize');
const { requireAuth, requireCsrf } = require('../lib/auth');
const { log } = require('../lib/logger');
const cors = require('../lib/cors');
const { CONSTANTS } = require('../lib/constants');
const db = require('../lib/db');

module.exports = requireAuth(async (req, res) => {
  if (cors(res, req)) return;
  if (!requireCsrf(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Methode non autorisee' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (!await rateLimit(ip, 'generate', CONSTANTS.RATE_LIMIT_GENERATE)) {
    return res.status(429).json({ error: 'Trop de requetes. Reessaie dans 1 minute.' });
  }

  try {
    const { news, feedback, provider, model, customPrompt, preview } = req.body;

    if (!customPrompt && (!news || !news.titre)) {
      return res.status(400).json({ error: 'Actualite source ou sujet libre requis' });
    }

    if (customPrompt && customPrompt.trim().length < 3) {
      return res.status(400).json({ error: 'Sujet trop court (min. 3 caracteres)' });
    }

    if (news && !news.titre.trim()) {
      return res.status(400).json({ error: 'Le titre de l\'actualite ne peut pas etre vide' });
    }

    const sanitizedPrompt = customPrompt ? sanitizeInput(customPrompt) : null;

    const resolvedProvider = provider || 'mistral';
    const resolvedModel = model || null;
    const generationType = sanitizedPrompt ? 'custom' : 'news';

    log('info', 'generate_start', { type: generationType, provider: resolvedProvider, model: resolvedModel, preview: !!preview });

    const article = await generateArticle(news, feedback || '', resolvedProvider, resolvedModel, sanitizedPrompt || null);

    const titre = (article.titre_interne || '').trim();
    const corps = (article.corps || '').trim();

    if (!titre && !corps) {
      log('error', 'generate_empty_response', { article: JSON.stringify(article).slice(0, 500) });
      throw new Error('La réponse IA est vide. Réessaie ou change de modèle.');
    }
    if (titre.length < 3) {
      log('error', 'generate_titre_too_short', { titre, corpsLength: corps.length });
      throw new Error('Le titre généré est trop court. Réessaie.');
    }
    if (corps.length < 20) {
      log('error', 'generate_corps_too_short', { titre, corpsLength: corps.length });
      throw new Error('Le contenu généré est trop court. Réessaie.');
    }

    log('info', 'generate_article_parsed', { titre: titre.slice(0, 50), corpsLength: corps.length, modelUsed: article._modelUsed });

    if (preview) {
      log('info', 'generate_preview_done', { modelUsed: article._modelUsed });
      return res.status(200).json({
        article: {
          titre_interne: article.titre_interne || 'Sans titre',
          corps: article.corps || '',
          accroche_a: article.accroche_a || null,
          accroche_b: article.accroche_b || null,
          hashtags: article.hashtags || [],
          image_keywords: article.image_keywords || [],
        },
        ia: {
          provider: resolvedProvider,
          model: resolvedModel || (article._modelUsed || null),
          generation_type: generationType,
          custom_subject: sanitizedPrompt || null,
        }
      });
    }

    let images = [];
    try {
      const imageResult = await findImagesForArticle({
        titre_interne: article.titre_interne || sanitizedPrompt || news?.titre || '',
        hashtags: article.hashtags || [],
        corps: article.corps || '',
        image_keywords: article.image_keywords || null,
      });
      images = imageResult || [];
    } catch (imgErr) {
      log('warn', 'generate_images_failed', { error: imgErr.message });
    }

    const primary = images[0] || null;

    const savedArticle = await db.createArticle({
      titre_interne: article.titre_interne || 'Sans titre',
      corps: article.corps || '',
      accroche_a: article.accroche_a || null,
      accroche_b: article.accroche_b || null,
      hashtags: article.hashtags || [],
      source_news_titre: news?.titre || null,
      source_news_url: news?.url || null,
      source_news_source: news?.source || null,
      ia_provider: resolvedProvider,
      ia_model: resolvedModel || article._modelUsed || null,
      generation_type: generationType,
      custom_subject: sanitizedPrompt || null,
      image_url: primary?.url || null,
      image_photographer: primary?.photographer || null,
      image_photographer_url: primary?.photographer_url || null,
      image_options: images,
    });

    log('info', 'generate_saved', { articleId: savedArticle.id });

    log('info', 'article_generated', { provider: resolvedProvider, model: resolvedModel, type: generationType, articleId: savedArticle.id });

    return res.status(200).json({
      article: savedArticle,
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
      return res.status(429).json({ error: 'Quota API depasse. Reessaie plus tard ou change de fournisseur.' });
    }
    if (err.message === 'CLE_INVALIDE') {
      return res.status(401).json({ error: 'Cle API invalide ou manquante pour ce fournisseur.' });
    }
    if (err.message.includes('Credits insuffisants') || err.message.includes('402')) {
      return res.status(402).json({ error: 'Credits insuffisants pour ce modele. Selectionne-en un autre.' });
    }
    if (err.message.includes('indisponible') || err.message.includes('404')) {
      return res.status(400).json({ error: 'Modele indisponible. Selectionne un autre modele.' });
    }
    return res.status(500).json({ error: 'Erreur lors de la generation. Reessaie.' });
  }
});
