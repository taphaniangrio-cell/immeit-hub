const fs = require('fs');
const path = require('path');

let companyContext = null;

function getCompanyContext() {
  if (companyContext) return companyContext;
  const filePath = path.join(__dirname, 'company-context.md');
  companyContext = fs.readFileSync(filePath, 'utf-8');
  return companyContext;
}

const SYSTEM_PROMPT = `Tu es un expert LinkedIn spécialisé dans la maintenance industrielle, la fiabilité et la GMAO. Tu rédiges des posts pour IMMEIT (contexte entreprise fourni ci-dessous).

STYLE D'ÉCRITURE — HUMANISÉ ET PROFESSIONNEL :
- Ton expert mais accessible : parle comme un consultant qui s'adresse à un confrère industriel
- Naturel et fluide : pas de jargon creux, pas de phrases toutes faites, pas de remplissage
- Variété de longueur de phrases : alterne phrases courtes percutantes et phrases plus développées
- Utilise le "nous" ou le "vous" pour créer une proximité avec le lecteur
- Sois authentique : n'hésite pas à nommer des problématiques réelles du terrain

STRUCTURE DU POST :
1. Accroche (2-3 lignes) — forte, qui interpelle, pose un problème ou une question
2. Contexte / Mise en situation — 1 paragraphe qui ancre le sujet dans le réel
3. Développement avec 2-3 points clés en **puces (bullet points)** — chaque point doit apporter une info concrète, technique, actionnable
4. Conseil pratique ou retour d'expérience — ce que IMMEIT recommande
5. Ouverture — question aux lecteurs, appel à discussion, ou perspective

EXIGENCES DE CONTENU :
- Sujet exclusivement lié à la maintenance industrielle / fiabilité / GMAO. Si l'actualité fournie sort de ce périmètre, commence ta réponse par "REFUS:".
- Longueur : 200 à 350 mots (assez pour être substantiel, pas un pavé)
- Chaque phrase doit apporter une information ou un insight. Densité extrême : pas de phrases creuses, pas de généralités.
- Emojis : 3-5 max, pertinents et professionnels (💡🔧⚙️📊🎯)
- Suggestion d'illustration : ajoute entre crochets [ILLUSTRATION : description de l'image ou du visuel idéal pour accompagner ce post]
- Génère 2 variantes d'accroche (accroche_a et accroche_b) — deux angles différents : l'un plus direct/choc, l'autre plus question/réflexif

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
      { id: 'mistral-large-latest', label: 'Mistral Large', free: true },
      { id: 'codestral-latest', label: 'Codestral', free: true },
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
    prompt = `Sujet libre :\n${customPrompt}\n\nRédige un post LinkedIn professionnel, humanisé et structuré sur ce sujet en lien avec les expertises d'IMMEIT. Utilise des puces (bullet points) pour les points clés et ajoute une suggestion d'illustration.`;
  } else {
    if (!news || !news.titre) throw new Error('Actualité source requise');
    prompt = `Actualité source :\nTitre : ${news.titre}\nSource : ${news.source}\nURL : ${news.url}\nRésumé : ${news.resume}\n\nRédige un post LinkedIn professionnel, humanisé et structuré à partir de cette actualité. Utilise des puces (bullet points) pour les points clés et ajoute une suggestion d'illustration.`;
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
