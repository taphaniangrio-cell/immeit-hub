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

Réponds UNIQUEMENT par un objet JSON valide, sans texte avant/après, sans blocs de code markdown :
{"titre_interne":"...","accroche_a":"...","accroche_b":"...","corps":"...","hashtags":["...","..."]}`;

function extractJSON(text) {
  if (!text) throw new Error('Réponse vide');
  const cleaned = text
    .replace(/```(?:json)?\n?/gi, '')
    .replace(/\n?```\s*$/gm, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) {
    console.error(`[extractJSON] No JSON object found. Raw text (first 500): ${text.slice(0, 500)}`);
    throw new Error('Réponse IA invalide. Réessaie.');
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

function openaiCall(endpoint, apiKey, model, system, prompt) {
  return async () => {
      const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
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
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        const status = response.status;
        if (status === 429) throw new Error('QUOTA');
        if (status === 401) throw new Error('CLÉ_INVALIDE');
        throw new Error(`ERREUR_API (HTTP ${status}): ${body.slice(0, 200)}`);
      }
      const data = await response.json();
      let content = data.choices?.[0]?.message?.content || '';
      if (!content) {
        content = data.choices?.[0]?.message?.reasoning || '';
      }
      return content;
    } finally {
      clearTimeout(timeout);
    }
  };
}

const PROVIDERS = {
  groq: {
    label: 'Groq (ultra-rapide)',
    needsKey: 'GROQ_API_KEY',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', free: true },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B', free: true },
    ],
    default: 'llama-3.3-70b-versatile',
    call: (model, system, prompt) => openaiCall('https://api.groq.com/openai/v1/chat/completions', process.env.GROQ_API_KEY, model, system, prompt)(),
  },

  openrouter: {
    label: 'OpenRouter (28+ models)',
    needsKey: 'OPENROUTER_API_KEY',
    models: [
      { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B', free: true },
      { id: 'deepseek/deepseek-chat', label: 'DeepSeek V3', free: true },
      { id: 'deepseek/deepseek-r1', label: 'DeepSeek R1', free: true },
      { id: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', free: true },
      { id: 'meta-llama/llama-4-scout', label: 'Llama 4 Scout (10M ctx)', free: true },
    ],
    default: 'meta-llama/llama-3.3-70b-instruct',
    call: (model, system, prompt) => openaiCall('https://openrouter.ai/api/v1/chat/completions', process.env.OPENROUTER_API_KEY, model, system, prompt)(),
  },

  cerebras: {
    label: 'Cerebras (2000+ tok/s)',
    needsKey: 'CEREBRAS_API_KEY',
    models: [
      { id: 'gpt-oss-120b', label: 'GPT-OSS 120B', free: true },
      { id: 'zai-glm-4.7', label: 'ZAI GLM 4.7', free: true },
    ],
    default: 'gpt-oss-120b',
    call: (model, system, prompt) => openaiCall('https://api.cerebras.ai/v1/chat/completions', process.env.CEREBRAS_API_KEY, model, system, prompt)(),
  },

  mistral: {
    label: 'Mistral (1B tok/mois)',
    needsKey: 'MISTRAL_API_KEY',
    models: [
      { id: 'mistral-small-latest', label: 'Mistral Small', free: true },
    ],
    default: 'mistral-small-latest',
    call: (model, system, prompt) => openaiCall('https://api.mistral.ai/v1/chat/completions', process.env.MISTRAL_API_KEY, model, system, prompt)(),
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
      return extractJSON(text);
    } catch (err) {
      lastError = err;
      if (err.message === 'QUOTA' || err.message === 'CLÉ_INVALIDE') throw err;
      if (model) throw err;
    }
  }

  throw lastError || new Error('Aucun modèle disponible');
}

module.exports = { generateArticle };
