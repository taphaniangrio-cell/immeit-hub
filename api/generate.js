const { generateArticle } = require('../lib/ai-client');
const { findImagesForArticle } = require('../lib/image-fetcher');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { news, feedback, provider, model, customPrompt } = req.body;

    if (!customPrompt && (!news || !news.titre)) {
      return res.status(400).json({ error: 'Actualité source ou sujet libre requis' });
    }

    if (customPrompt && customPrompt.trim().length < 3) {
      return res.status(400).json({ error: 'Sujet trop court (min. 3 caractères)' });
    }

    const resolvedProvider = provider || 'groq';
    const resolvedModel = model || null;
    const generationType = customPrompt ? 'custom' : 'news';
    const article = await generateArticle(news, feedback || '', resolvedProvider, resolvedModel, customPrompt || null);

    const images = await findImagesForArticle({
      titre_interne: article.titre_interne,
      hashtags: article.hashtags,
      corps: article.corps,
    });

    const primary = images[0] || null;

    return res.status(200).json({
      article: { ...article, image_url: primary?.url || null, image_photographer: primary?.photographer || null, image_photographer_url: primary?.photographer_url || null, image_options: images },
      ia: {
        provider: resolvedProvider,
        model: resolvedModel || (article._modelUsed || null),
        generation_type: generationType,
        custom_subject: customPrompt || null,
      }
    });
  } catch (err) {
    if (err.message === 'QUOTA') {
      return res.status(429).json({ error: 'Quota API dépassé. Réessaie plus tard ou change de fournisseur.' });
    }
    if (err.message === 'CLÉ_INVALIDE') {
      return res.status(401).json({ error: 'Clé API invalide pour ce fournisseur.' });
    }
    return res.status(500).json({ error: err.message });
  }
};
