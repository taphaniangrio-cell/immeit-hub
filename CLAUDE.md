# IMMEIT Hub — Plateforme interne multi-apps

Application hub interne regroupant les outils IMMEIT (maintenance industrielle, fiabilité, GMAO).

## Stack

**Vercel Serverless (Node.js) + Vercel Postgres (Neon) + vanilla JS frontend + Shell Hub v3.**

## Structure

```
articles-immeit/
├── api/
│   ├── auth.js        # POST /api/auth — authentification
│   ├── news.js        # GET  /api/news — RSS sectoriel filtré
│   ├── generate.js    # POST /api/generate — appel IA
│   └── articles.js    # CRUD /api/articles — articles PostgreSQL
├── public/
│   ├── index.html     # Shell hub + 2 apps (articles, dashboard)
│   ├── app.js         # Router + store + apps (1929 lignes)
│   └── style.css      # Design system + shell layout
├── lib/
│   ├── company-context.md
│   ├── db.js
│   └── rss-fetcher.js
├── db/
│   └── schema.sql
├── server.mjs
├── vercel.json
├── package.json
├── .env.example
├── .gitignore
└── CLAUDE.md
```

## Architecture Hub

```
shell (flex row, 100vh)
├── shell-sidebar (220px, navy)
│   ├── brand
│   ├── nav links (data-app target)
│   ├── spacer
│   └── version
├── shell-main (flex: 1, column)
│   ├── shell-topbar (52px)
│   │   ├── title
│   │   ├── AI selector
│   │   └── logout
│   └── shell-viewport (flex: 1)
│       ├── .app-row (flex row)       ← Articles
│       │   ├── .article-list-section
│       │   └── .editor
│       └── .dashboard                ← Dashboard
```

**Routage** : `showMain()` / `showDashboard()` togglent `.hidden` sur les sections + `.app-row`. Pas de hash router externe.

**Cache** : `APP_VERSION` localStorage + `?v=104` sur CSS/JS. Reload automatique si version change.

## API

| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/auth` | POST | Authentification (password → cookie session) |
| `/api/news` | GET | Actualités RSS filtrées par mots-clés |
| `/api/generate` | POST | Génération article via IA |
| `/api/articles` | GET | Liste des articles (filtre `?statut=`) |
| `/api/articles?id=N` | GET | Un article |
| `/api/articles` | POST | Créer un article |
| `/api/articles?id=N` | PUT | Modifier un article |
| `/api/articles?id=N` | DELETE | Supprimer un article |

## Déploiement

1. Créer un projet sur Vercel lié à ce repo
2. Ajouter les variables d'environnement dans Vercel :
   - `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `CEREBRAS_API_KEY`, `MISTRAL_API_KEY`
   - `DATABASE_URL` — URL de connexion Vercel Postgres
   - `ADMIN_PASSWORD` — mot de passe d'accès à l'outil
3. `git push` → déploiement automatique
4. Initialiser la base : `psql $DATABASE_URL -f db/schema.sql`

## Développement local

```bash
cp .env.example .env
npm install
node server.mjs        # → http://localhost:3000
```

Pour ajouter une app : créer la section dans `#shell-viewport`, ajouter un nav link `data-app`, implémenter `showMaNouvelleApp()` dans `app.js`.

## Règles de génération d'articles

- Sujet limité à maintenance industrielle, fiabilité, GMAO
- 150–250 mots, 2 accroches (A/B), ton expert accessible
- Prompt injecte `lib/company-context.md` systématiquement
- Réponse JSON : `{titre_interne, accroche_a, accroche_b, corps, hashtags}`
- Refus si hors périmètre (réponse commence par "REFUS:")
