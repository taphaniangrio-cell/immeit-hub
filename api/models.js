const { requireAuth } = require('../lib/auth');
const cors = require('../lib/cors');
const { PROVIDERS_CONFIG } = require('../lib/providers-config');

module.exports = requireAuth(async (req, res) => {
  if (cors(res, req)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const models = {};
    for (const [key, config] of Object.entries(PROVIDERS_CONFIG)) {
      const keyValue = process.env[config.needsKey];
      models[key] = {
        label: config.label,
        enabled: !!keyValue,
        needsKey: config.needsKey,
        models: config.models,
        default: config.default,
      };
    }

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.status(200).json({ models });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur interne. Réessaie.' });
  }
});
