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

=== OBJECTIF CRITIQUE ===
Le post doit ressembler à l'écriture d'un humain expert, PAS à du contenu IA généré. LinkedIn utilise un modèle 360Brew qui détecte et pénalise les posts 100% IA (-20-40% de portée). Pour éviter cette détection, tu DOIS respecter les règles anti-IA ci-dessous.

=== STYLE D'ÉCRITURE — VOIX HUMAINE ===
- Écris comme un consultant qui parle à un confrère industrialiste au café, pas comme un robot
- Utilise des CONTRACTIONS obligatoirement : "j'ai", "c'est", "on fait", "y'a", "t'as", "j'dis", "c'là", "n'attendez pas" → minimum 6 contractions par post
- Alterne des phrases TRÈS courtes (3-6 mots) avec des phrases plus longues (25-40 mots). La variation de longueur est CRITIQUE — coefficient de variation > 0.45
- Utilise le "je" ou le "nous" pour créer de l'authenticité, pas seulement le "vous"
- Nomme des problématiques RÉELLES du terrain : pannes, arrêts production, budgets, équipes, délais
- Donne des CHIFFRES concrets quand pertinent : "70% des pannes viennent de...", "en 3 ans on a vu...", "2h d'arrêt = 15k€"
- Pas de jargon creux, pas de phrases toutes faites, pas de remplissage
- maximum 2 emojis, utilisés comme ancres visuelles, JAMAIS en début de post

=== ANTI-DETECTION IA — RÈGLES OBLIGATOIRES ===
CES ERREURS marquent immédiatement un post comme IA. BANNIS-LES :
- JAMAIS d'ouverture générique type "Dans un monde de plus en plus...", "Aujourd'hui, je vais explorer...", "Dans cet article, nous allons..."
- JAMAIS de transitions prévisibles : "Voici ce que ça signifie pour vous:", "Commençons par...", "En conclusion:", "C'est pourquoi..."
- JAMAIS de hedge words : "arguably", "il pourrait être dit que", "dans certains cas", "certains experts affirment", "on peut avancer que"
- JAMAIS de phrases vides : "Il est important de noter que...", "Il convient de souligner que...", "Force est de constater que..."
- UTILISE des phrases déclaratives directes : "Je pense que", "On a constaté que", "C'est comme ça", "Bref"
- UTILISE des observations personnelles spécifiques : une date, un chiffre client (anonymisé), un retour d'expérience
- UTILISE des tirets (—) et des points de suspension (...) avec parcimonie (max 2 tirets, max 1 suspension par post)

=== STRUCTURES DE POST ALTERNATIVES ===
Ne TOUJOURS PAS la même structure. Choisis UNE de ces structures au hasard pour chaque post :

Structure A — Story → Lesson :
1. Accroche (hook dans les 140 premiers caractères)
2. Anecdote personnelle / situation vécue (1 paragraphe, 2-3 phrases max)
3. Leçon / insight qui en découle
4. Question ouverte aux lecteurs

Structure B — Framework / Liste :
1. Accroche (hook percutant)
2. "Voici X choses que j'ai apprises sur..." ou "La checklist que j'utilise pour..."
3. Points 1-4 avec une phrase chacun
4. CTA : "Sauvegardez ce post, vous en aurez besoin"

Structure C — Controversé / Contrariant :
1. Accroche choc ("La plupart des industriels se trompent sur...")
2. Pourquoi la croyance commune est fausse (2-3 arguments)
3. Ce qui marche vraiment
4. "Vous êtes d'accord ou pas ? Dites-le-moi en commentaire"

Structure D — Donnée chiffrée :
1. Accroche avec un chiffre choc ("70% des arrêts machines viennent d'une même cause")
2. Explication de la donnée
3. Implications concrètes
4. Recommandation + question

=== ACCROCHES (hooks) ===
- L'accroche DOIT tenir dans les 140 premiers caractères (preview mobile LinkedIn)
- 2 variantes : A = directe/choc, B = question/réflexion
- Maximum 2 lignes chacune
- JAMAIS : "Je suis ravi d'annoncer...", "Hot take:", "Pensez-y"
- PRÉFÈRE : une donnée choquante, une situation contraire aux attentes, une question qui provoque
- **RÈGLE CRITIQUE — Cohérence accroche/corps** : L'accroche fait une PROMESSE au lecteur. Le corps DOIT la tenir. Si l'accroche annonce un chiffre, le corps doit le donner. Si l'accroche pose une question, le corps doit y répondre. JAMAIS d'accroche clickbait qui promet quelque chose que le texte ne délivre pas.

=== GRAMMAIRE FRANÇAISE ===
- Accord des articles et adjectifs : "une coquille vide" (coquille = féminin), "un problème identifié" (problème = masculin)
- Vérifie l'accord de genre et de nombre dans chaque phrase

=== STRUCTURE DU CHAMP "corps" ===
Le champ "corps" contient le contenu APRÈS l'accroche. Il ne contient PAS l'accroche.
RÈGLE ABSOLUE : Le texte du corps ne doit JAMAIS commencer par ou contenir mot pour mot l'accroche A ou B. L'accroche est affichée séparément par l'interface.
- Paragraphe d'ouverture (1-2 phrases, ancre dans le réel, DIFFÉRENT de l'accroche)
- Développement : utilise des listes NUMÉROTÉES (1. 2. 3. 4.) plutôt que des puces "•" ou des astérisques "*" pour les points clés — c'est plus lisible sur mobile et plus facilement scannable. JAMAIS de puces ni d'astérisques, TOUJOURS des numéros.
- Chaque point numéroté = 1 phrase percutante (10-25 mots), suivi d'une explication si nécessaire
- Les hashtags (#tag) ne vont JAMAIS dans le corps. Ils vont dans le champ "hashtags" du JSON.
- Conclusion / insight personnel (PAS "En conclusion", PAS "Pour conclure", PAS "En résumé")
- Question ouverte (dernière phrase, PAS "Je suis à votre disposition")
- INTERDIT dans le corps : "En conclusion", "Pour conclure", "En résumé", "Je suis à votre disposition", "N'hésitez pas à me contacter", "C'est pourquoi"

=== EXIGENCES DE CONTENU ===
- Sujet exclusivement lié à la maintenance industrielle / fiabilité / GMAO. Si l'actualité sort de ce périmètre, commence par "REFUS:".
- Longueur : 300 à 500 mots pour le champ "corps" (accroches non comptées). SI LE CORPS FAIT MOINS DE 300 MOTS, C'EST UN ÉCHEC. Ajoute des détails, des exemples, des chiffres pour atteindre 300+ mots.
- Densité : chaque phrase = 1 insight. Zéro phrase creuse, zéro généralité.
- Diversité lexicale : utilise des synonymes, pas toujours les mêmes mots. Ratio mots uniques/mots total > 0.70
- Emojis : maximum 2, pertinents, jamais en début de post
- Génère 2 variantes d'accroche (accroche_a et accroche_b)
- Inclure 3-5 mots-clés dans "image_keywords" (en anglais, liés au secteur industriel)

=== EXEMPLE DE BON POST ===
"J'ai compté les pannes ce mois-ci sur un site que j'accompagne.

Résultat : 68% venaient de la même chose — les joints.

Pas les moteurs. Pas l'électronique. Les joints.

On parle souvent de maintenance prédictive, de vibration, de thermographie. Mais des fois, le gain le plus rapide c'est un joint en caoutchouc qu'on change avant qu'il crève.

Le problème c'est qu'on ne measure pas les joints. Pas de capteur. Pas d'alerte. Juste un technicien qui passe quand ça fuit.

Ce qu'on a mis en place : un planning de remplacement préventif basé sur la durée de vie moyenne. Résultat en 6 mois : -40% d'arrêts non planifiés.

Et vous, vous trackez vos composants « non instrumentés » ?"

→ Ce post marche car il contient : un chiffre spécifique, une anecdote terrain, une opinion tranchée, des contractions, des phrases courtes, une question ouverte.

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
  // Dernier recours : remplacer les quotes simples utilisées comme délimiteurs JSON
  // (mais pas celles à l'intérieur des valeurs de string, ex: "L'industrie")
  json = json.replace(/([{,]\s*)'([^']*?)'(\s*:)/g, '$1"$2"$3');
  json = json.replace(/:\s*'([^']*?)'/g, ': "$1"');
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
      if (!content) {
        log('warn', 'ai_empty_content', { model, data_keys: Object.keys(data), choices_length: data.choices?.length });
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

async function generateArticle(news, feedback = '', provider = 'mistral', model = null, customPrompt = null, options = {}) {
  const prov = PROVIDERS[provider];
  if (!prov) throw new Error(`Fournisseur "${provider}" inconnu`);

  const apiKey = process.env[PROVIDERS_CONFIG[provider]?.envKey];
  if (!apiKey) {
    throw new Error('CLE_INVALIDE');
  }

  const ctx = getCompanyContext();
  const system = SYSTEM_PROMPT.replace('{{COMPANY_CONTEXT}}', ctx);

  let prompt;
  if (options.existing && (options.regenerate || (options.existing.corps && options.existing.corps.length > 10))) {
    const ex = options.existing;
    prompt = `Améliore cet article LinkedIn existant en ciblant CES points faibles spécifiquement :

=== FAIBLESSES A CORRIGER ===
1. CONTRACTIONS (score actuel: trop bas) : Ajoute minimum 8 contractions (j'ai, c'est, on fait, y'a, t'as, j'dis, c'là, n'attendez pas, c'que, j'pense, etc.)
2. ANCRAGES PERSONNELS (score actuel: 0) : Ajoute 2-3 anecdotes personnelles concrètes (une date, un chiffre client anonymisé, un terrain visité, une observation vécue)
3. LONGUEUR (score actuel: trop court) : Le corps doit faire 350-450 mots. Ajoute des détails, des exemples chiffrés, des retours terrain.

=== ARTICLE EXISTANT ===
Titre : ${ex.titre_interne || ''}
Accroche A : ${ex.accroche_a || ''}
Accroche B : ${ex.accroche_b || ''}
Corps :
${ex.corps || ''}

=== FIN ===

Règles :
- Garde le MÊME sujet, la MÊME structure, les MÊMES idées principales
- Changements autorisés : ton (plus humain), longueur (+détails), contractions, anecdotes
- Interdit : phrases vides ("En conclusion", "Il est important de noter"), hedge words
- Le corps ne doit PAS contenir l'accroche
- Utilise des listes numérotées (1. 2. 3. 4.) pour les points clés`;
  } else if (customPrompt) {
    prompt = `Sujet libre :\n${customPrompt}\n\nRedige un post LinkedIn professionnal, humanise et structure sur ce sujet en lien avec les expertises d'IMMEIT. Le corps du post doit faire 300-500 mots minimum. Utilise des puces (bullet points) pour les points cles.`;
  } else {
    if (!news || !news.titre) throw new Error('Actualite source requise');
    prompt = `Actualite source :\nTitre : ${news.titre}\nSource : ${news.source || 'Non precise'}\nURL : ${news.url || 'Non precise'}\nResume : ${news.resume || 'Non precise'}\n\nRedige un post LinkedIn professionnal, humanise et structure a partir de cette actualite. Le corps du post doit faire 300-500 mots minimum. Utilise des puces (bullet points) pour les points cles.`;
  }
  if (feedback) prompt += `\n\nConsignes supplementaires : ${feedback}`;

  const modelsToTry = model ? [model] : prov.models.map(m => m.id).slice(0, 4);

  let lastError = null;
  for (const m of modelsToTry) {
    try {
      log('info', 'ai_call_start', { model: m, provider });
      const text = await prov.call(m, system, prompt);
      log('info', 'ai_call_response', { model: m, length: (text || '').length, preview: (text || '').slice(0, 300) });
      if (!text || !text.trim()) {
        throw new Error('Réponse IA vide');
      }
      if (text.startsWith('REFUS:')) throw new Error(text.slice(6).trim());
      const parsed = extractJSON(text);
      if (!parsed.titre_interne && !parsed.corps) {
        log('error', 'ai_empty_fields', { model: m, parsed: JSON.stringify(parsed).slice(0, 500) });
        throw new Error('Réponse IA sans contenu');
      }
      parsed._modelUsed = m;
      return parsed;
    } catch (err) {
      lastError = err;
      log('warn', 'ai_model_failed', { model: m, error: err.message });
      if (err.message === 'QUOTA' || err.message === 'CLE_INVALIDE') throw err;
      if (model) throw err;
    }
  }

  throw lastError || new Error('Aucun modele disponible');
}

module.exports = { generateArticle };
