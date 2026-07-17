# Générateur d'articles LinkedIn — IMMEIT

Application interne de génération d'articles LinkedIn pour IMMEIT (maintenance industrielle, fiabilité, GMAO).

## Stack

- **Runtime:** Node.js (Vercel Serverless)
- **Base de données:** Supabase (Postgres gratuit, sans limite de transfert)
- **Frontend:** Vanilla JS + CSS custom properties
- **IA:** Groq / OpenRouter / Cerebras / Mistral

## Structure

```
articles-immeit/
├── api/            # Endpoints serverless (auth, articles, generate, news, models)
├── temp-react/       # Frontend React (Vite + Tailwind + Zustand)
├── lib/            # Modules partagés (db, auth, cors, logger, ai-client, rss-fetcher, …)
├── db/schema.sql   # Schéma PostgreSQL
├── server.mjs      # Serveur de développement local
├── vercel.json     # Configuration déploiement + headers sécurité
└── .env.example    # Variables d'environnement
```

## API

| Route | Méthode | Auth | Description |
|-------|---------|------|-------------|
| `/api/auth` | POST | — | Login (session HttpOnly + token) ou logout (`action: "logout"`) |
| `/api/news` | GET | requireAuth | Actualités RSS filtrées |
| `/api/generate` | POST | requireAuth | Génération article via IA |
| `/api/articles` | GET | requireAuth | Liste articles (`?statut=`, `?page=`, `?limit=`) |
| `/api/articles?id=N` | GET | requireAuth | Un article |
| `/api/articles` | POST | requireAuth | Créer un article |
| `/api/articles?id=N` | PUT | requireAuth | Modifier un article |
| `/api/articles?id=N` | DELETE | requireAuth | Supprimer un article |
| `/api/models` | GET | requireAuth | Modèles IA disponibles |

## Modules partagés (`lib/`)

- **`auth.js`** — Middleware `requireAuth()` + session store in-memory (Map), TTL 7 jours, nettoyage automatique chaque heure. Protection CSRF via `requireCsrf()` (double-submit cookie + `X-CSRF-Token` header).
- **`cors.js`** — En-têtes CORS avec whitelist configurable via `ALLOWED_ORIGIN`
- **`logger.js`** — Logger structuré JSON, niveaux (debug/info/warn/error), configurable via `LOG_LEVEL`
- **`db.js`** — Connexion PostgreSQL (pg driver)
- **`ai-client.js`** — Appels aux API IA (Groq, OpenRouter, Cerebras, Mistral)
- **`rss-fetcher.js`** — Récupération et filtrage RSS secteur maintenance
- **`rateLimit.js`** — Rate limiting in-memory par IP
- **`sanitize.js`** — Nettoyage des entrées utilisateur
- **`image-fetcher.js`** — Recherche d'images Pexels pour les articles
- **`company-context.md`** — Contexte IMMEIT injecté dans le prompt IA

## Déploiement

1. Créer un projet Vercel lié à ce repo
2. Ajouter les variables d'environnement :
   - `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `CEREBRAS_API_KEY`, `MISTRAL_API_KEY` (au moins un)
   - `DATABASE_URL` (Vercel Postgres)
   - `SESSION_SECRET` — générer avec : `crypto.randomBytes(32).toString("hex")`
   - `PASSWORD_HASH` — hash bcrypt du mot de passe (`node scripts/generate-hash.js <mdp>`)
   - `PEXELS_API_KEY` (optionnel, pour les images)
   - `LOG_LEVEL` (optionnel : debug, info, warn, error)
   - `ALLOWED_ORIGIN` (optionnel : origines CORS supplémentaires)
3. `git push` → déploiement automatique
4. Initialiser la base : `psql $DATABASE_URL -f db/schema.sql`

## Développement local

```bash
cp .env.example .env   # remplir les valeurs
npm install
node server.mjs        # → http://localhost:3000
```

## Règles de génération

- Sujet limité à maintenance industrielle, fiabilité, GMAO
- 150–250 mots, 2 accroches (A/B), ton expert accessible
- Prompt injecte `lib/company-context.md` systématiquement
- Réponse JSON : `{titre_interne, accroche_a, accroche_b, corps, hashtags}`
- Refus si hors périmètre (réponse commence par "REFUS:")
