const db = require('../lib/db');

module.exports = async (req, res) => {
  const { method } = req;
  const { id } = req.query;

  try {
    switch (method) {
      case 'GET': {
        if (id) {
          const article = await db.getArticleById(parseInt(id));
          if (!article) return res.status(404).json({ error: 'Article introuvable' });
          return res.status(200).json({ article });
        }
        const result = await db.getArticles({ statut: req.query.statut || null, page: req.query.page, limit: req.query.limit });
        return res.status(200).json(result);
      }

      case 'POST': {
        const article = await db.createArticle(req.body);
        return res.status(201).json({ article });
      }

      case 'PUT': {
        if (!id) return res.status(400).json({ error: 'ID requis' });
        const article = await db.updateArticle(parseInt(id), req.body);
        if (!article) return res.status(404).json({ error: 'Article introuvable' });
        return res.status(200).json({ article });
      }

      case 'DELETE': {
        if (!id) return res.status(400).json({ error: 'ID requis' });
        const deleted = await db.deleteArticle(parseInt(id));
        if (!deleted) return res.status(404).json({ error: 'Article introuvable' });
        return res.status(200).json({ success: true });
      }

      default:
        return res.status(405).json({ error: 'Méthode non autorisée' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
