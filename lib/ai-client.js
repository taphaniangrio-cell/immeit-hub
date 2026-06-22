const fs = require('fs');
const path = require('path');

let companyContext = null;

function getCompanyContext() {
  if (companyContext) return companyContext;
  const filePath = path.join(__dirname, 'company-context.md');
  companyContext = fs.readFileSync(filePath, 'utf-8');
  return companyContext;
}

const SYSTEM_PROMPT = `Tu rédiges des posts LinkedIn pour IMMEIT (contexte entreprise fourni ci-dessous).

Contraintes strictes :
- Sujet exclusivement lié à la maintenance industrielle / fiabilité / GMAO.
  Si l'actualité fournie sort de ce périmètre, refuse en commençant ta réponse par "REFUS:".
- Longueur : 150 à 250 mots.
- Structure : accroche forte dans les 2 premières lignes, angle d'expertise IMMEIT, conseil actionnable, question ou ouverture en fin.
- DENSITÉ EXTRÊME : chaque phrase doit apporter une information ou un insight. Pas de phrases creuses, pas de remplissage, pas de généralités. Sois précis, technique et concret.
- Pas d'emoji excessif (2-3 max).
- Génère 2 variantes d'accroche.

Contexte entreprise :
{{COMPANY_CONTEXT}}

Réponds UNIQUEMENT par un objet JSON valide, sans texte avant/après :
{"titre_interne":"...","accroche_a":"...","accroche_b":"...","corps":"...","hashtags":["...","..."]}`;

const PROVIDERS = {
  groq: {
    label: 'Groq (gratuit)',
    needsKey: 'GROQ_API_KEY',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', free: true },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B', free: true },
      { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B', free: true },
      { id: 'gemma2-9b-it', label: 'Gemma 2 9B', free: true },
    ],
    async call(model, system, prompt) {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 4096,
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        const status = response.status;
        if (status === 429) throw new Error('QUOTA');
        if (status === 401) throw new Error('CLÉ_INVALIDE');
        throw new Error(`ERREUR_API (HTTP ${status}): ${body.slice(0, 200)}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    },
  },

  gemini: {
    label: 'Google Gemini (gratuit)',
    needsKey: 'GEMINI_API_KEY',
    models: [
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', free: true },
      { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', free: true },
      { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', free: true },
      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', free: true },
    ],
    async call(model, system, prompt) {
      const key = process.env.GEMINI_API_KEY;
      const isAuthKey = key && !key.startsWith('AIza');
      const url = isAuthKey
        ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
        : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      const headers = {
        'Content-Type': 'application/json',
        ...(isAuthKey ? { 'x-goog-api-key': key } : {}),
      };

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
          },
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        const status = response.status;
        if (status === 429) throw new Error('QUOTA');
        if (status === 401 || status === 403) throw new Error('CLÉ_INVALIDE');
        throw new Error(`ERREUR_API (HTTP ${status}): ${body.slice(0, 200)}`);
      }

      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    },
  },

  openrouter: {
    label: 'OpenRouter (gratuit)',
    needsKey: 'OPENROUTER_API_KEY',
    models: [
      { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B', free: true },
      { id: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash', free: true },
      { id: 'mistralai/mistral-small-3.1-24b-instruct', label: 'Mistral Small 3.1', free: true },
      { id: 'deepseek/deepseek-chat', label: 'DeepSeek V3', free: true },
      { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini', free: false },
      { id: 'anthropic/claude-3-haiku-20240307', label: 'Claude 3 Haiku', free: true },
    ],
    async call(model, system, prompt) {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://github.com/taphaniangrio-cell/articles-immeit',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 4096,
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        const status = response.status;
        if (status === 429) throw new Error('QUOTA');
        if (status === 401 || status === 402) throw new Error('CLÉ_INVALIDE');
        throw new Error(`ERREUR_API (HTTP ${status}): ${body.slice(0, 200)}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    },
  },

  anthropic: {
    label: 'Anthropic Claude (pas de crédits)',
    needsKey: 'ANTHROPIC_API_KEY',
    models: [
      { id: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku (le moins cher)', free: false },
      { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', free: false },
    ],
    async call(model, system, prompt) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        const status = response.status;
        if (status === 429) throw new Error('QUOTA');
        if (status === 401) throw new Error('CLÉ_INVALIDE');
        throw new Error(`ERREUR_API (HTTP ${status}): ${body.slice(0, 200)}`);
      }

      const data = await response.json();
      return data.content?.[0]?.text || '';
    },
  },
};

async function generateArticle(news, feedback = '', provider = 'groq', model = null, customPrompt = null) {
  const prov = PROVIDERS[provider];
  if (!prov) throw new Error(`Fournisseur "${provider}" inconnu`);

  const ctx = getCompanyContext();
  const system = SYSTEM_PROMPT.replace('{{COMPANY_CONTEXT}}', ctx);

  let prompt;
  if (customPrompt) {
    prompt = `Sujet libre :\n${customPrompt}\n\nGénère un post LinkedIn dense et technique sur ce sujet en lien avec les expertises d'IMMEIT.`;
  } else {
    if (!news || !news.titre) throw new Error('Actualité source requise');
    prompt = `Actualité source :\nTitre : ${news.titre}\nSource : ${news.source}\nURL : ${news.url}\nRésumé : ${news.resume}\n\nGénère un post LinkedIn dense et technique à partir de cette actualité.`;
  }
  if (feedback) prompt += `\n\nConsignes supplémentaires : ${feedback}`;

  const modelsToTry = model ? [model] : prov.models.map(m => m.id);

  let lastError = null;
  for (const m of modelsToTry) {
    try {
      const text = await prov.call(m, system, prompt);

      if (text.startsWith('REFUS:')) throw new Error(text.slice(6).trim());

      try {
        const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
        return json;
      } catch {
        throw new Error('Réponse IA invalide. Réessaie.');
      }
    } catch (err) {
      lastError = err;
      if (err.message === 'QUOTA' || err.message === 'CLÉ_INVALIDE') throw err;
      if (model) throw err;
    }
  }

  throw lastError || new Error('Aucun modèle disponible');
}

module.exports = { generateArticle };
