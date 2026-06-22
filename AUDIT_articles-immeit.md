# AUDIT COMPLET — articles-immeit.vercel.app
> Générateur d'articles LinkedIn IMMEIT · Audit technique & UX · Juin 2026  
> À injecter directement dans l'agent IA pour correction itérative

---

## CONTEXTE DE L'APP

- **URL** : https://articles-immeit.vercel.app  
- **Stack** : Node.js (API Vercel Serverless) · Vercel Postgres · Anthropic API · RSS feeds  
- **Front** : Vanilla HTML/CSS/JS (SPA mono-fichier probable)  
- **Rôle** : Outil interne IMMEIT — génération, révision, validation et publication d'articles LinkedIn dans le domaine maintenance industrielle

---

## RÉSUMÉ EXÉCUTIF

| Domaine | Sévérité | Nb de problèmes |
|---|---|---|
| 🔴 Sécurité | Critique | 4 |
| 🟠 Architecture | Majeur | 5 |
| 🟡 UX / Workflow éditorial | Moyen | 6 |
| 🔵 Performance | Moyen | 3 |
| ⚪ Qualité code & maintenabilité | Mineur | 5 |

---

## 🔴 SÉCURITÉ — CRITIQUE

### SEC-01 · Authentification par mot de passe simple côté client
**Problème** : Le login repose sur un unique champ "Mot de passe" sans username. Ce pattern expose à :
- Brute-force sans rate limiting visible
- Mot de passe stocké en dur dans le JS front-end (si vérification côté client)
- Aucune session sécurisée (cookie HttpOnly / SameSite)

**Correction requise** :
```js
// api/auth.js — implémenter un vrai endpoint de login
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { password } = req.body;

  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }

  // Signer un token JWT ou cookie signé
  const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '8h' });
  res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/`);
  res.status(200).json({ ok: true });
}
```
- Vérification CÔTÉ SERVEUR uniquement (jamais dans le JS front)
- Rate limiting : max 5 tentatives / 15 min par IP (via `@vercel/kv` ou middleware)
- Variable d'env `ADMIN_PASSWORD` dans Vercel Dashboard, jamais hardcodée

---

### SEC-02 · Clé API Anthropic potentiellement exposée
**Problème** : Si les appels à l'API Anthropic sont faits depuis le front-end (XHR/fetch direct), la clé `ANTHROPIC_API_KEY` est visible dans les DevTools réseau.

**Correction requise** : Tous les appels Anthropic **doivent passer par un serverless endpoint** :
```
/api/generate → appelle Anthropic server-side → retourne le contenu
/api/news     → appelle les RSS feeds → retourne les actualités filtrées
```
Jamais d'appel direct `api.anthropic.com` depuis le navigateur.

---

### SEC-03 · Headers de sécurité HTTP absents ou incomplets
**Problème** : Aucun `vercel.json` de security headers détecté (ou incomplet).

**Correction requise** — ajouter dans `vercel.json` :
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.anthropic.com" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" }
      ]
    }
  ]
}
```

---

### SEC-04 · API routes sans authentification server-side
**Problème** : Les routes `/api/articles`, `/api/generate`, `/api/news` sont probablement accessibles sans token valide — n'importe qui connaissant l'URL peut lire/créer/supprimer des articles.

**Correction requise** : Middleware d'auth sur toutes les routes API :
```js
// lib/authMiddleware.js
import jwt from 'jsonwebtoken';

export function requireAuth(handler) {
  return async (req, res) => {
    const token = req.cookies?.token;
    try {
      jwt.verify(token, process.env.JWT_SECRET);
      return handler(req, res);
    } catch {
      return res.status(401).json({ error: 'Non authentifié' });
    }
  };
}
// Usage : export default requireAuth(async (req, res) => { ... })
```

---

## 🟠 ARCHITECTURE — MAJEUR

### ARCH-01 · Absence de gestion d'état robuste (SPA vanilla)
**Problème** : La SPA vanilla JS sans framework gère l'état (liste articles, article courant, modal ouvert, onglet actif) via des variables globales et manipulations DOM directes — source de bugs d'état et difficulté à maintenir.

**Correction** : Implémenter un mini store centralisé :
```js
// store.js
const state = {
  articles: [],
  currentArticle: null,
  activeTab: 'all',
  isLoading: false,
  error: null
};
const listeners = [];

export function getState() { return { ...state }; }
export function setState(patch) {
  Object.assign(state, patch);
  listeners.forEach(fn => fn(state));
}
export function subscribe(fn) { listeners.push(fn); }
```

---

### ARCH-02 · Route `/api/generate` — absence de timeout et gestion d'erreur Anthropic
**Problème** : Les appels à l'API Anthropic peuvent prendre 15-30 secondes. Si le serverless Vercel timeout (limite : 10s en Hobby, 60s en Pro), l'utilisateur voit une erreur opaque. Pas de retry ni de feedback pendant la génération.

**Corrections** :
```js
// api/generate.js
export const config = { maxDuration: 60 }; // Vercel Pro required

export default async function handler(req, res) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: req.body.prompt }],
    }, { signal: controller.signal });

    clearTimeout(timeout);
    res.json({ content: response.content[0].text });
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Génération trop longue, réessayez.' });
    }
    res.status(500).json({ error: 'Erreur Anthropic : ' + err.message });
  }
}
```

Front : afficher un spinner avec message animé ("Génération en cours…") pendant l'attente.

---

### ARCH-03 · Schema Vercel Postgres non versionné
**Problème** : Aucune migration visible — le schema SQL est probablement créé manuellement via `psql` ou en one-shot. En cas de reset ou nouveau déploiement, la BDD doit être recréée à la main.

**Correction** : Créer `db/schema.sql` et `db/migrations/` :
```sql
-- db/schema.sql
CREATE TABLE IF NOT EXISTS articles (
  id          SERIAL PRIMARY KEY,
  titre       TEXT NOT NULL,
  corps       TEXT,
  hashtags    TEXT,
  source_url  TEXT,
  source_titre TEXT,
  statut      TEXT DEFAULT 'brouillon' CHECK (statut IN ('brouillon','en_revision','valide','publie','archive')),
  date_creation TIMESTAMPTZ DEFAULT NOW(),
  date_modification TIMESTAMPTZ DEFAULT NOW(),
  date_publication TIMESTAMPTZ,
  consignes_ia TEXT,
  mots        INTEGER GENERATED ALWAYS AS (array_length(regexp_split_to_array(trim(corps), '\s+'), 1)) STORED
);

CREATE INDEX IF NOT EXISTS idx_articles_statut ON articles(statut);
CREATE INDEX IF NOT EXISTS idx_articles_date ON articles(date_creation DESC);
```
Ajouter un script `npm run db:init` dans `package.json`.

---

### ARCH-04 · RSS feeds — parsing non robuste
**Problème** : Les flux RSS du domaine maintenance industrielle sont souvent mal formés ou en XML non standard. Si le parser échoue silencieusement, la modale "Choisir une actualité source" affiche rien sans explication.

**Correction** :
```js
// api/news.js
import Parser from 'rss-parser';
const parser = new Parser({ timeout: 8000 });

const FEEDS = [
  'https://www.usinenouvelle.com/rss/maintenance.xml',
  'https://www.maintenanceandengineering.com/feed/',
  // ... autres feeds IMMEIT
];

export default async function handler(req, res) {
  const results = await Promise.allSettled(
    FEEDS.map(url => parser.parseURL(url))
  );

  const articles = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value.items.slice(0, 5))
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  if (!articles.length) {
    return res.status(200).json({ articles: [], warning: 'Aucun flux disponible actuellement' });
  }

  res.json({ articles });
}
```

---

### ARCH-05 · Champ "mots" calculé côté client uniquement
**Problème** : Le compteur "0 mots" sous le textarea corps de l'article est recalculé à chaque frappe côté client. Si un article existant est chargé depuis la BDD, le compte de mots peut être faux au premier rendu si le corpus n'a pas déclenché l'event `input`.

**Correction** :
```js
function updateWordCount(text) {
  const count = text.trim() ? text.trim().split(/\s+/).length : 0;
  document.getElementById('word-count').textContent = `${count} mot${count > 1 ? 's' : ''}`;
}

// À appeler aussi au chargement d'un article existant :
function loadArticle(article) {
  corpsTextarea.value = article.corps || '';
  updateWordCount(corpsTextarea.value); // ← déclencher manuellement
  // ...
}
```

---

## 🟡 UX / WORKFLOW ÉDITORIAL — MOYEN

### UX-01 · Bouton "Supprimer" sans confirmation suffisante
**Problème** : Un clic accidentel sur "Supprimer" peut effacer un article validé sans retour arrière. Aucun soft-delete (archive) visible.

**Correction** :
- Implémenter un **soft-delete** : `statut = 'archive'` plutôt que `DELETE FROM articles`
- Dialog de confirmation natif ou modal custom :
```js
async function deleteArticle(id) {
  const confirmed = await showConfirmModal(
    'Supprimer cet article ?',
    'Cette action est irréversible. L\'article sera archivé.'
  );
  if (!confirmed) return;
  await fetch(`/api/articles/${id}`, { method: 'DELETE' });
  refreshList();
}
```

---

### UX-02 · Absence d'auto-save
**Problème** : Si l'utilisateur ferme l'onglet ou que le réseau coupe pendant la rédaction, tout le contenu non sauvegardé est perdu. Aucun indicateur "modifications non enregistrées".

**Correction** :
```js
let autoSaveTimer;
let isDirty = false;

corpsTextarea.addEventListener('input', () => {
  isDirty = true;
  setSaveStatus('⏳ Modifications non enregistrées');
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(autoSave, 3000); // auto-save après 3s d'inactivité
});

async function autoSave() {
  if (!isDirty || !currentArticleId) return;
  await saveArticle();
  isDirty = false;
  setSaveStatus('✓ Sauvegardé');
}

window.addEventListener('beforeunload', (e) => {
  if (isDirty) e.preventDefault(); // alerte navigateur
});
```

---

### UX-03 · Flux de statut non guidé
**Problème** : Les 5 statuts (Brouillon → En révision → Validé → Publié → Archivé) ne sont pas représentés visuellement comme un pipeline. L'utilisateur ne sait pas quelle action fait avancer le statut.

**Correction** : Afficher une barre de progression de statut dans la vue article :
```
● Brouillon → ● En révision → ● Validé → ● Publié
```
Et documenter les transitions possibles (ex : seul "Valider" fait passer de "En révision" → "Validé").

---

### UX-04 · Modale "Choisir une actualité" — UX pauvre
**Problème** : La modale affiche "Recherche des actualités…" mais sans :
- Timeout visible si le flux échoue
- Filtres par thème/source
- Prévisualisation du titre + résumé + date de l'article source avant sélection
- Possibilité de coller manuellement une URL

**Correction** : Enrichir la modale avec :
```html
<div class="news-item" data-url="...">
  <span class="news-source">Usine Nouvelle</span>
  <h4 class="news-title">Titre de l'article</h4>
  <p class="news-summary">Résumé court…</p>
  <span class="news-date">Il y a 2h</span>
</div>
```

---

### UX-05 · Champ "Hashtags" sans aide ni validation
**Problème** : Le placeholder "séparés par des espaces" n'est pas assez explicite. Aucune suggestion de hashtags pertinents pour le domaine maintenance industrielle. Pas de validation (hashtags sans `#`, caractères spéciaux…).

**Correction** :
- Afficher des hashtags suggérés cliquables : `#MaintenanceIndustrielle` `#GMAO` `#RCM` `#AMDEC` `#FiabiliteEquipements`
- Validation : formatter automatiquement en ajoutant `#` si absent
- Compteur : "5/10 hashtags (recommandé LinkedIn : 3-5)"

---

### UX-06 · Bouton "Copier pour LinkedIn" — format non optimisé
**Problème** : LinkedIn impose des contraintes de format spécifiques : 3000 caractères max, pas de Markdown (les `**gras**` ne s'affichent pas), espaces entre paragraphes, emojis comme séparateurs visuels.

**Correction** : Pré-traiter le corps avant la copie :
```js
function formatForLinkedIn(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')        // Supprimer markdown bold
    .replace(/#{1,6}\s/g, '')               // Supprimer titres markdown
    .replace(/\n{3,}/g, '\n\n')             // Max 2 sauts de ligne
    .trim();
}

const charCount = formatted.length;
if (charCount > 3000) {
  showWarning(`Article trop long pour LinkedIn : ${charCount}/3000 caractères`);
}
```

---

## 🔵 PERFORMANCE — MOYEN

### PERF-01 · Chargement initial lent (Serverless cold start)
**Problème** : Sur Vercel Hobby, les serverless functions subissent des cold starts de 500ms-2s. La page affiche "Chargement…" trop longtemps.

**Correction** :
- Utiliser `stale-while-revalidate` sur `/api/articles` :
```js
res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
```
- Afficher un skeleton loader au lieu du simple "Chargement…" :
```html
<div class="skeleton-card"></div>
<div class="skeleton-card"></div>
```
```css
.skeleton-card {
  height: 80px; border-radius: 8px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
```

---

### PERF-02 · Pas de pagination sur la liste d'articles
**Problème** : Si l'app accumule 50+ articles, la requête `SELECT * FROM articles` sans `LIMIT` sera lente et la liste non scrollable.

**Correction** :
```js
// api/articles.js
const page = parseInt(req.query.page) || 1;
const limit = 20;
const offset = (page - 1) * limit;

const { rows } = await sql`
  SELECT id, titre, statut, date_creation, mots
  FROM articles
  WHERE statut = ${statut || 'brouillon'}
  ORDER BY date_creation DESC
  LIMIT ${limit} OFFSET ${offset}
`;
```

---

### PERF-03 · Images / favicon manquants ou non optimisés
**Problème** : Pas de favicon visible, pas de meta `og:image` (pertinent même pour un outil interne si partagé en équipe). Le CSS est probablement inline ou chargé sans minification.

**Correction** :
- Ajouter `favicon.ico` ou `favicon.svg` (logo IMMEIT)
- Minifier CSS/JS en production si non compilé
- Ajouter dans `<head>` :
```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta name="robots" content="noindex, nofollow"> <!-- outil interne -->
```

---

## ⚪ QUALITÉ CODE & MAINTENABILITÉ — MINEUR

### CODE-01 · Absence de fichier `.env.example`
Créer `.env.example` (sans vraies valeurs) pour documenter toutes les variables requises :
```
ADMIN_PASSWORD=
JWT_SECRET=
ANTHROPIC_API_KEY=
POSTGRES_URL=
POSTGRES_PRISMA_URL=
POSTGRES_URL_NO_SSL=
POSTGRES_USER=
POSTGRES_HOST=
POSTGRES_PASSWORD=
POSTGRES_DATABASE=
```

---

### CODE-02 · Aucun logging structuré
Les erreurs sont probablement loggées avec `console.error()` uniquement. En production Vercel, les logs ne sont visibles que 24h.

**Correction** : Intégrer un logger minimal :
```js
// lib/logger.js
export function log(level, event, data = {}) {
  console[level](JSON.stringify({
    timestamp: new Date().toISOString(),
    level, event, ...data
  }));
}
// Usage : log('error', 'anthropic_call_failed', { articleId, error: err.message });
```

---

### CODE-03 · Prompt Anthropic hardcodé dans le code
**Problème** : Le prompt de génération d'articles LinkedIn est probablement écrit directement dans `api/generate.js`. Difficile à affiner sans redéployer.

**Correction** : Externaliser dans `prompts/linkedin-article.js` :
```js
export function buildPrompt({ actualite, consignes, hashtags }) {
  return `Tu es un expert en communication LinkedIn pour le secteur maintenance industrielle en Afrique de l'Ouest.
Rédige un article LinkedIn professionnel de 1200-1500 mots basé sur cette actualité :
---
${actualite}
---
Contraintes :
- Ton : expert, pédagogique, orienté terrain Afrique de l'Ouest
- Structure : accroche forte, développement en 3 parties, call-to-action
- Hashtags suggérés : ${hashtags || '#MaintenanceIndustrielle #GMAO #RCM'}
${consignes ? `- Consignes spécifiques : ${consignes}` : ''}
Format : texte brut, pas de Markdown, paragraphes séparés par une ligne vide.`;
}
```

---

### CODE-04 · Pas de validation des entrées API
Les endpoints API acceptent des corps JSON sans validation.

**Correction** : Valider avec un schéma simple :
```js
function validateArticle(body) {
  const errors = [];
  if (!body.titre?.trim()) errors.push('Titre requis');
  if (body.titre?.length > 200) errors.push('Titre trop long (max 200 car.)');
  if (body.corps?.length > 5000) errors.push('Corps trop long (max 5000 car.)');
  const validStatuts = ['brouillon','en_revision','valide','publie','archive'];
  if (body.statut && !validStatuts.includes(body.statut)) errors.push('Statut invalide');
  return errors;
}
```

---

### CODE-05 · README absent ou incomplet
**Correction** : Créer `README.md` minimal :
```md
# Articles IMMEIT — Générateur LinkedIn

## Setup local
1. `npm install`
2. Copier `.env.example` → `.env.local` et remplir les valeurs
3. `npm run db:init` — créer les tables Postgres
4. `npm run dev` — démarrer sur http://localhost:3000

## Architecture
- `api/` — Serverless functions (articles CRUD, generate, news)
- `public/` — Front SPA (index.html, style.css, app.js)
- `lib/` — Utilitaires (auth, logger, db)
- `prompts/` — Templates de génération IA
- `db/` — Schema SQL et migrations

## Déploiement
Push sur `main` → déploiement automatique Vercel
Variables d'env à configurer dans Vercel Dashboard.
```

---

## PLAN DE CORRECTION PRIORITISÉ

### Phase 1 — Critique (semaine 1)
- [ ] **SEC-01** : Authentification server-side avec JWT + cookie HttpOnly
- [ ] **SEC-02** : Proxifier tous les appels Anthropic via `/api/generate`
- [ ] **SEC-03** : Headers HTTP dans `vercel.json`
- [ ] **SEC-04** : Middleware d'auth sur toutes les routes API

### Phase 2 — Majeur (semaine 2)
- [ ] **ARCH-02** : Timeout + gestion d'erreur `/api/generate` + spinner front
- [ ] **ARCH-03** : Versionner le schema SQL + script `db:init`
- [ ] **ARCH-04** : Robustifier le parsing RSS avec `Promise.allSettled`
- [ ] **UX-01** : Soft-delete + confirmation suppression
- [ ] **UX-02** : Auto-save + indicateur "modifications non enregistrées"

### Phase 3 — Moyen (semaine 3)
- [ ] **UX-06** : Pré-traitement "Copier pour LinkedIn" (strip Markdown + compteur 3000 chars)
- [ ] **PERF-01** : Skeleton loader + cache `stale-while-revalidate`
- [ ] **PERF-02** : Pagination liste articles
- [ ] **CODE-03** : Externaliser le prompt Anthropic
- [ ] **CODE-04** : Validation des entrées API

### Phase 4 — Mineur (semaine 4)
- [ ] **UX-03** : Barre de progression de statut visuelle
- [ ] **UX-04** : Enrichir la modale news (prévisualisation, filtres)
- [ ] **UX-05** : Suggestions hashtags + validation
- [ ] **ARCH-01** : Mini store JS centralisé
- [ ] **CODE-01..05** : .env.example, logger, README, wordcount fix

---

## CHECKLIST RAPIDE POUR L'AGENT IA

```
PRIORITÉ 1 : Sécurité
- Vérifier que ANTHROPIC_API_KEY n'est JAMAIS dans le front-end (grep sur index.html/app.js)
- Vérifier que le login POST est géré dans /api/auth.js et non dans app.js
- Ajouter les headers dans vercel.json si absent
- Ajouter requireAuth() sur chaque fichier dans /api/ sauf /api/auth.js

PRIORITÉ 2 : Robustesse
- Ajouter export const config = { maxDuration: 60 } dans api/generate.js
- Wrapper le parser RSS dans Promise.allSettled()
- Ajouter LIMIT/OFFSET dans la requête SELECT articles

PRIORITÉ 3 : UX
- Ajouter auto-save avec debounce 3s
- Ajouter formatForLinkedIn() avant navigator.clipboard.writeText()
- Ajouter updateWordCount() au chargement d'un article existant
```

---

*Audit généré automatiquement sur la base de l'analyse de l'interface et de l'architecture Node.js/Vercel de l'app IMMEIT.*  
*Version : 1.0 · Date : Juin 2026*
