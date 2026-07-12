## Objective
- Faire fonctionner le sync SharePoint de manière 100% autonome (local et Vercel) sans
  aucune intervention humaine récurrente. **Statut : atteint.**

## Architecture

### Authentification Graph (`lib/graph-auth.js`)
Un seul point d'entrée d'authentification Microsoft Graph. Deux modes, essayés dans cet
ordre à chaque demande de jeton :

1. **App-only (client_credentials)** — actif seulement si `SHAREPOINT_CLIENT_ID` +
   `SHAREPOINT_CLIENT_SECRET` sont configurés (App Registration Azure AD + permission
   Application `Sites.Selected`/`Sites.Read.All`, consentement admin). **Non configuré
   actuellement** — voir `scripts/setup-azure-app.mjs` si ces droits deviennent disponibles.
2. **Délégué silencieux (MSAL, cache persistant en base)** — mode actif par défaut. Une
   unique connexion interactive (device code), faite une fois via
   `node scripts/connect-sharepoint.js`, suffit : le refresh token est stocké dans la table
   Postgres `dashboard_cache` (clé `msal_token_cache`) et réutilisé silencieusement par TOUS
   les environnements. Suit le pattern officiel "distributed cache plugin" de `@azure/msal-node`.
3. **Device code interactif** — dernier recours, jamais déclenché automatiquement depuis une
   requête API (seulement si `allowInteractive:true`).

### Synchronisation — deux orchestrateurs

Il y a **deux** modules de synchronisation qui coexistent :

- **`lib/auto-sync.js`** (`performSync()`) — orchestrateur principal. Appelé par `api/sync.js`
  (cron Vercel/GitHub Actions + bouton "Sync") et par la boucle locale `server.mjs`.
  Enchaîne : fetch live → filtre → sauvegarde dans tous les caches (DB, fichier, GitHub) →
  diff-detector → email-alert → event bus.

- **`lib/sync-engine.js`** (`executeSync()`) — orchestrateur secondaire avec retry et
  circuit-breaker. Appelé par `api/sync-status.js` pour le statut et le force-sync.
  Même logique de base mais avec retryWithBackoff, lock dédié, et fallback chaîné
  (client_credentials → device code → DB → fichier → GitHub).

Les deux partagent la même chaîne de fallback et les mêmes modules de base
(`sharepoint.js`, `github-cache.js`, `diff-detector.js`, `email-alert.js`).

### Fetch SharePoint (`lib/sharepoint.js`)
Logique de fetch Graph (site → fichier → onglet → lignes). Utilise `graph-auth.getGraphToken()`
quel que soit le mode actif. Valeurs par défaut pour site/fichier/onglet (fonctionne sans
configuration). Capture `lastModifiedBy`. Applique `filterDataRows()` pour éliminer les
lignes vides/filler.

### Dashboard (`api/dashboard.js`)
Tente une lecture live à CHAQUE ouverture (pas seulement via cron). Chaîne de fallback :
live (15s timeout) → DB cache → GitHub cache. Si le live réussi, sauvegarde en DB.

## Infrastructure
- **Vercel CRON** : `0 5 * * *` (1x/jour, filet de secours)
- **GitHub Actions** : `*/30 * * * *`, déclenche un vrai fetch live via `/api/sync`
- **Cache GitHub** : branche `cache` du dépôt, accessible publiquement (dernier recours)
- **DB** : Supabase PostgreSQL, table `dashboard_cache` pour les données et le cache MSAL
- **Auth** : sessions HMAC-SHA256 avec timing-safe comparison (`lib/auth.js`)

## Sécurité
- Comparaison HMAC `timingSafeEqual` (pas de `!==` pour les signatures)
- Rate limiting sur tous les endpoints (`lib/rateLimit.js`)
- CSRF protection sur les mutations (`lib/auth.js` → `requireCsrf`)
- Pas de secrets dans le code (tout est dans `.env`)

## Work State — Projet opérationnel et autonome
Le dashboard affiche 1013 articles depuis SharePoint. La synchronisation est entièrement
automatique (cron GitHub Actions toutes les 30 min, cron Vercel quotidien, lecture live
à chaque ouverture). Le refresh token MSAL est persisté en DB et partagé entre tous les
environnements.

## Relevant Files

### Auth & Security
- `lib/graph-auth.js` : authentification Graph (app-only + délégué)
- `lib/msal-cache-plugin.js` : persistance du cache MSAL (Postgres)
- `lib/auth.js` : sessions, CSRF, requireAuth
- `lib/rateLimit.js` : rate limiting

### Synchronisation
- `lib/sharepoint.js` : fetch des données SharePoint + filterDataRows
- `lib/auto-sync.js` : orchestrateur principal (performSync)
- `lib/sync-engine.js` : orchestrateur secondaire (executeSync, retry, lock)
- `lib/sync-lock.js` : lock filesystem pour éviter les syncs concurrents
- `lib/github-cache.js` : cache de secours GitHub (lecture + publication)
- `lib/diff-detector.js` : détection de changements entre syncs
- `lib/email-alert.js` : alertes email (modifications + reconnexion)
- `lib/events.js` : bus d'événements SSE

### API
- `api/dashboard.js` : GET /api/dashboard, live → DB → GitHub
- `api/sync.js` : POST /api/sync, délègue à autoSync.performSync()
- `api/sync-status.js` : GET/POST /api/sync-status, statut + force-sync
- `api/dashboard-sync.js` : POST /api/dashboard-sync, sauvegarde manuelle
- `api/articles.js` : CRUD articles
- `api/auth.js` : login/logout
- `api/generate.js` : génération d'articles IA
- `api/images.js` : recherche d'images
- `api/models.js` : liste des modèles IA
- `api/news.js` : flux RSS

### Infrastructure
- `server.mjs` : serveur local avec sync continue
- `vercel.json` : CRON + headers cache
- `.github/workflows/sync.yml` : GitHub Actions cron
- `lib/db.js` : connexion PostgreSQL avec retry
- `lib/cache-dir.js` : gestion des répertoires de cache
- `lib/cors.js` : CORS
- `lib/logger.js` : logging structuré
- `lib/constants.js` : constantes (timeouts, limits)
- `lib/ai-client.js` : client IA multi-provider
- `lib/providers-config.js` : configuration des providers IA

### Scripts
- `scripts/connect-sharepoint.js` : connexion initiale unique (device code)
- `scripts/setup-azure-app.mjs` : assistant app-only (nécessite droits admin)
- `scripts/generate-hash.js` : génération de hash mot de passe
- `scripts/lint.js` : vérification syntaxique
- `scripts/check-db-cache.js` : debug — inspection cache DB
- `scripts/check-token.js` : debug — état token MSAL
- `scripts/debug-filter.js` : debug — test filtre SharePoint

### Frontend
- `public/index.html` : page principale
- `public/app.js` : logique client (v160)
- `public/style.css` : styles

### Config
- `.env.example` : variables d'environnement documentées
- `AGENTS.md` : ce fichier
