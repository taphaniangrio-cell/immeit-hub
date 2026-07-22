const db = require('../lib/db');
const rateLimit = require('../lib/rateLimit');
const { requireAuth, requireCsrf } = require('../lib/auth');
const { log } = require('../lib/logger');
const cors = require('../lib/cors');
const { CONSTANTS } = require('../lib/constants');

const ALLOWED_STATUTS = new Set(['brouillon', 'en_revision', 'valide', 'publie', 'archive']);
const ALLOWED_ACCROCHE = new Set(['a', 'b']);

module.exports = requireAuth(async (req, res) => {
  if (cors(res, req)) return;
  if (!requireCsrf(req, res)) return;

  const { method } = req;
  const { id } = req.query;

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (method !== 'GET' && !await rateLimit(ip, 'articles', CONSTANTS.RATE_LIMIT_ARTICLES)) {
    return res.status(429).json({ error: 'Trop de requêtes. Réessaie dans 1 minute.' });
  }

  try {
    switch (method) {
      case 'GET': {
        if (id) {
          const parsedId = parseInt(id);
          if (isNaN(parsedId)) return res.status(400).json({ error: 'ID invalide' });
          const article = await db.getArticleById(parsedId);
          if (!article) return res.status(404).json({ error: 'Article introuvable' });
          return res.status(200).json({ article });
        }
        const result = await db.getArticles({ statut: req.query.statut || null, page: req.query.page, limit: req.query.limit });
        return res.status(200).json(result);
      }

      case 'POST': {
        const body = req.body || {};
        if (!body.titre_interne || typeof body.titre_interne !== 'string' || body.titre_interne.trim().length < 1) {
          return res.status(400).json({ error: 'Le champ titre_interne est requis' });
        }
        if (!body.corps || typeof body.corps !== 'string' || body.corps.trim().length < 1) {
          return res.status(400).json({ error: 'Le champ corps est requis' });
        }
        body.titre_interne = body.titre_interne.trim().slice(0, 500);
        body.corps = body.corps.trim();
        const article = await db.createArticle(body);
        return res.status(201).json({ article });
      }

      case 'PUT': {
        if (!id) return res.status(400).json({ error: 'ID requis' });
        const parsedId = parseInt(id);
        if (isNaN(parsedId)) return res.status(400).json({ error: 'ID invalide' });
        const body = req.body || {};
        if (body.statut && !ALLOWED_STATUTS.has(body.statut)) {
          return res.status(400).json({ error: `Statut invalide. Valeurs autorisees : ${[...ALLOWED_STATUTS].join(', ')}` });
        }
        if (body.titre_interne !== undefined) {
          if (typeof body.titre_interne !== 'string' || body.titre_interne.trim().length < 1) {
            return res.status(400).json({ error: 'titre_interne invalide' });
          }
          body.titre_interne = body.titre_interne.trim().slice(0, 500);
        }
        if (body.corps !== undefined) {
          if (typeof body.corps !== 'string' || body.corps.trim().length < 1) {
            return res.status(400).json({ error: 'corps invalide' });
          }
          body.corps = body.corps.trim();
        }
        if (body.accroche_active !== undefined && !ALLOWED_ACCROCHE.has(body.accroche_active)) {
          return res.status(400).json({ error: 'accroche_active invalide (a ou b)' });
        }
        if (body.hashtags !== undefined && !Array.isArray(body.hashtags) && typeof body.hashtags !== 'string') {
          return res.status(400).json({ error: 'hashtags invalide' });
        }
        log('info', 'articles_put_debug', { id: parsedId, keys: Object.keys(body), hashtagsType: typeof body.hashtags });
        const article = await db.updateArticle(parsedId, body);
        if (!article) return res.status(400).json({ error: 'Aucun champ valide à modifier' });
        return res.status(200).json({ article });
      }

      case 'DELETE': {
        if (!id) return res.status(400).json({ error: 'ID requis' });
        const parsedId = parseInt(id);
        if (isNaN(parsedId)) return res.status(400).json({ error: 'ID invalide' });
        const deleted = await db.deleteArticle(parsedId);
        if (!deleted) return res.status(404).json({ error: 'Article introuvable' });
        return res.status(200).json({ success: true });
      }

      default:
        return res.status(405).json({ error: 'Méthode non autorisée' });
    }
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Un article avec cette source existe déjà' });
    }
    log('error', 'articles_error', { method, id: id || null, error: err.message, code: err.code, stack: err.stack?.substring(0, 300) });
    return res.status(500).json({ error: 'Erreur interne. Réessaie.' });
  }
});
