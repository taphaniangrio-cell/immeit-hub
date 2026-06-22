# Projet — Générateur d'articles LinkedIn IMMEIT

Application interne de génération d'articles LinkedIn pour IMMEIT (maintenance industrielle, fiabilité, GMAO).

## Stack

**Vercel Serverless (Node.js) + Vercel Postgres (Neon) + vanilla JS frontend.**

## Structure

```
articles-immeit/
├── api/
│   ├── auth.js        # POST /api/auth — authentification
│   ├── news.js        # GET  /api/news — RSS sectoriel filtré
│   ├── generate.js    # POST /api/generate — appel Claude
│   └── articles.js    # CRUD /api/articles — articles PostgreSQL
├── public/
│   ├── index.html
│   ├── app.js
│   └── style.css
├── lib/
│   ├── company-context.md  # contexte IMMEIT injecté dans le prompt
│   ├── db.js               # connexion PostgreSQL (Neon serverless)
│   └── rss-fetcher.js      # récupération + filtrage RSS
├── db/
│   └── schema.sql
├── server.mjs           # serveur de dev local
├── vercel.json
├── package.json
├── .env.example
├── .gitignore
└── CLAUDE.md
```

## API

| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/auth` | POST | Authentification (password → cookie session) |
| `/api/news` | GET | Actualités RSS filtrées par mots-clés |
| `/api/generate` | POST | Génération article via Claude |
| `/api/articles` | GET | Liste des articles (filtre `?statut=`) |
| `/api/articles?id=N` | GET | Un article |
| `/api/articles` | POST | Créer un article |
| `/api/articles?id=N` | PUT | Modifier un article |
| `/api/articles?id=N` | DELETE | Supprimer un article |

## Déploiement

1. Créer un projet sur Vercel lié à ce repo
2. Ajouter les variables d'environnement dans Vercel :
   - `ANTHROPIC_API_KEY` — clé API Anthropic (Claude)
   - `DATABASE_URL` — URL de connexion Vercel Postgres
   - `ADMIN_PASSWORD` — mot de passe d'accès à l'outil
   - `SESSION_SECRET` — secret pour les sessions
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
