const fs = require('fs');
const path = require('path');
const { log } = require('./logger');
const { PROVIDERS_CONFIG } = require('./providers-config');
const { CONSTANTS } = require('./constants');

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
- Sois authentique : nomme des problématiques réelles du terrain, donne des chiffres ou ordres de grandeur quand c'est pertinent

STRUCTURE DU POST (le champ "corps" ne contient que les parties 2 à 5) :
1. Accroche → UNIQUEMENT dans les champs "accroche_a" et "accroche_b" (2-3 lignes chacune, percutante)
2. Contexte / Mise en situation — 1 paragraphe qui ancre le sujet dans le réel (début du champ "corps")
3. Développement avec 2-4 points clés en bullet points (dans le champ "corps") :
   • Chaque bullet commence par le caractère "•" suivi d'un espace
   • Chaque bullet fait 1 ligne max (10-20 mots), lisible en un coup d'œil
   • Les infos complémentaires vont dans une phrase normale avant ou après la liste
   • Saut de ligne AVANT le premier bullet et APRÈS le dernier
4. Conseil pratique ou retour d'expérience — ce que IMMEIT recommande (dans le champ "corps")
5. Ouverture — question aux lecteurs ou perspective (fin du champ "corps")

EXIGENCES DE CONTENU :
- Sujet exclusivement lié à la maintenance industrielle / fiabilité / GMAO. Si l'actualité fournie sort de ce périmètre, commence ta réponse par "REFUS:".
- Longueur : 200 à 350 mots pour le champ "corps" uniquement (accroches non comptées)
- Chaque phrase doit apporter une information ou un insight. Densité extrême : pas de phrases creuses, pas de généralités.
- Emojis : 4-6, pertinents et professionnels (💡🔧⚙️📊🎯🏭📈✅) — 1 par section pour rythmer la lecture, jamais en début de post
- Génère 2 variantes d'accroche différentes (accroche_a et accroche_b) — l'une directe/choc, l'autre sous forme de question/réflexion. Maximum 3 lignes chacune.
- Le champ "corps" ne doit PAS contenir l'accroche. Il commence directement par le contexte.
- Inclure 3-5 mots-clés pertinents dans le champ "image_keywords" pour illustrer le sujet (en anglais, liés au secteur industriel).

Contexte entreprise :
{{COMPANY_CONTEXT}}

Réponds UNIQUEMENT par un objet JSON valide, sans texte avant/après, sans blocs de code markdown :
{"titre_interne":"...","accroche_a":"...","accroche_b":"...","corps":"...","hashtags":["...","..."],"image_keywords":["...","..."]}`;

function extractJSON(text) {
  if (!text) throw new Error('Réponse vide');
  const cleaned = text
    .replace(/```(?:json)?\n?/gi, '')
    .replace(/\n?```\s*$/gm, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) {
    log('error', 'extract_json_no_object', { rawText: text.slice(0, 500) });
    throw new Error('Réponse IA invalide. Réessaie.');
  }
  let json = cleaned.slice(start, end + 1);
  json = json.replace(/[\u0000-\u001F]/g, ' ');
  json = json.replace(/\r\n?/g, '\n');
  try { return JSON.parse(json); } catch {}
  json = json.replace(/\n/g, '\\n').replace(/\t/g, '\\t');
  json = json.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
  try { return JSON.parse(json); } catch {}
  json = json.replace(/'/g, '"');
  json = json.replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');
  json = json.replace(/,\s*([}\]])/g, '$1');
  try { return JSON.parse(json); } catch {}
  log('error', 'extract_json_parse_failed', { json: json.slice(0, 500) });
  throw new Error('Réponse IA invalide. Réessaie.');
}

function openaiCall(endpoint, apiKey, model, system, prompt) {
  return async () => {
      const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONSTANTS.AI_REQUEST_TIMEOUT);
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
        const status = response.status;
        const body = await response.text().catch(() => '');
        if (status === 429) throw new Error('QUOTA');
        if (status === 401) throw new Error('CLE_INVALIDE');
        if (status === 402) throw new Error(`Credits insuffisants pour ${model}`);
        if (status === 404) throw new Error(`Modele "${model}" indisponible`);
        log('error', 'ai_client_http_error', { status, model, body: body.slice(0, 300) });
        throw new Error(`ERREUR_API (HTTP ${status})`);
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

const PROVIDERS = {};
for (const [key, config] of Object.entries(PROVIDERS_CONFIG)) {
  PROVIDERS[key] = {
    label: config.label,
    needsKey: config.needsKey,
    models: config.models,
    default: config.default,
    call: (model, system, prompt) => openaiCall(config.endpoint, process.env[config.envKey], model, system, prompt)(),
  };
}

async function generateArticle(news, feedback = '', provider = 'groq', model = null, customPrompt = null) {
  const prov = PROVIDERS[provider];
  if (!prov) throw new Error(`Fournisseur "${provider}" inconnu`);

  const apiKey = process.env[PROVIDERS_CONFIG[provider]?.envKey];
  if (!apiKey) {
    throw new Error('CLE_INVALIDE');
  }

  const ctx = getCompanyContext();
  const system = SYSTEM_PROMPT.replace('{{COMPANY_CONTEXT}}', ctx);

  let prompt;
  if (customPrompt) {
    prompt = `Sujet libre :\n${customPrompt}\n\nRedige un post LinkedIn professionnal, humanise et structure sur ce sujet en lien avec les expertises d'IMMEIT. Utilise des puces (bullet points) pour les points cles.`;
  } else {
    if (!news || !news.titre) throw new Error('Actualite source requise');
    prompt = `Actualite source :\nTitre : ${news.titre}\nSource : ${news.source || 'Non precise'}\nURL : ${news.url || 'Non precise'}\nResume : ${news.resume || 'Non precise'}\n\nRedige un post LinkedIn professionnal, humanise et structure a partir de cette actualite. Utilise des puces (bullet points) pour les points cles.`;
  }
  if (feedback) prompt += `\n\nConsignes supplementaires : ${feedback}`;

  const modelsToTry = model ? [model] : prov.models.map(m => m.id).slice(0, 4);

  let lastError = null;
  for (const m of modelsToTry) {
    try {
      const text = await prov.call(m, system, prompt);
      if (text.startsWith('REFUS:')) throw new Error(text.slice(6).trim());
      const parsed = extractJSON(text);
      parsed._modelUsed = m;
      return parsed;
    } catch (err) {
      lastError = err;
      if (err.message === 'QUOTA' || err.message === 'CLE_INVALIDE') throw err;
      if (model) throw err;
    }
  }

  throw lastError || new Error('Aucun modele disponible');
}

module.exports = { generateArticle };
