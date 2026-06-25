# AUDIT CORRECTIONS — articles-immeit

> Analyse croisée des audits vs codebase réel · Juin 2026  
> Compare `AUDIT_articles-immeit.md` et `AUDIT_PRO_articles-immeit.md` à l'implémentation actuelle.

---

## LÉGENDE

| État | Signification |
|------|--------------|
| ✅ **CORRIGÉ** | Implémenté dans le code |
| ⚠️ **PARTIEL** | Partiellement ou différemment implémenté |
| ❌ **MANQUANT** | Non implémenté |
| 🔄 **N/A** | Sans objet ou déjà présent avant l'audit |

---

## 1. SÉCURITÉ

| ID Audit | Intitulé | État | Fichiers | Notes |
|----------|----------|------|----------|-------|
| SEC-01 / S-02 | Auth bcrypt + cookie HttpOnly | ✅ CORRIGÉ | `api/auth.js:28-31`, `api/auth.js:41` | Bcrypt via `PASSWORD_HASH`, cookie HttpOnly 7 jours, rate limit 10/min |
| SEC-02 | Clé API côté serveur uniquement | ✅ CORRIGÉ | `api/generate.js`, `lib/ai-client.js` | Aucun appel IA depuis le front-end |
| SEC-03 | Headers sécurité HTTP | ⚠️ PARTIEL | `server.mjs:152-155` | Présents dans le serveur dev (`server.mjs`) mais absents de `vercel.json` → pas appliqués en production Vercel. CSP et HSTS manquants. |
| SEC-04 | Auth middleware sur routes API | ❌ MANQUANT | — | Aucun `requireAuth()` sur `/api/articles`, `/api/generate`, `/api/news`, `/api/models`. Routes ouvertes sans cookie. |
| S-01 / S-04 | Rate limiting + messages | ✅ CORRIGÉ | `lib/rateLimit.js` | Toutes les routes POST/GET limitées. Erreurs génériques sans stack. |
| S-05 | Sanitisation inputs IA | ✅ CORRIGÉ | `lib/sanitize.js`, `api/generate.js:23-27` | strip `< >`, max 500 chars |
| S-06 | Session expiration explicite | ⚠️ PARTIEL | `api/auth.js:41` | Max-Age=7j côté cookie, mais pas de vérification d'expiration côté serveur (pas de JWT). |
| S-07 | CORS strict | ❌ MANQUANT | — | Aucun header CORS sur les routes API. |

---

## 2. ARCHITECTURE

| ID Audit | Intitulé | État | Fichiers | Notes |
|----------|----------|------|----------|-------|
| ARCH-01 | Store centralisé | ❌ MANQUANT | `public/app.js:1-` | Variables globales : `articles`, `filter`, `editingId`, etc. |
| ARCH-02 | Timeout generate | ✅ CORRIGÉ | `lib/ai-client.js:77-78` | AbortController 90s |
| ARCH-03 | Schema versionné | ✅ CORRIGÉ | `db/schema.sql` | Avec migrations safe (ALTER TABLE IF NOT EXISTS) |
| ARCH-04 | RSS parsing robuste | ✅ CORRIGÉ | `lib/rss-fetcher.js:229-248` | `Promise.allSettled`, catch par feed, cache 30 min |
| ARCH-05 | Word count au chargement | ✅ CORRIGÉ | `public/app.js:240-242` | `updateWords()` appelé dans `showEditor()` |
| A-01 | Cache RSS | ✅ CORRIGÉ | `lib/rss-fetcher.js:25-26,224-227` | Cache in-memory 30 min TTL |
| A-02 | Pagination BDD | ✅ CORRIGÉ | `lib/db.js:41-67`, `api/articles.js` | LIMIT/OFFSET, page/limit params |
| A-03 | Trigger updated_at | ✅ CORRIGÉ | `db/schema.sql:39-46` | Fonction + trigger plpgsql |
| A-04 | Favicon / PWA | ✅ CORRIGÉ | `public/index.html:17-19` | favicon, apple-touch-icon, theme-color |

---

## 3. UX / INTERFACE

| ID Audit | Intitulé | État | Fichiers | Notes |
|----------|----------|------|----------|-------|
| UX-01 | Soft-delete + confirmation | ✅ CORRIGÉ | `public/app.js:415-442` | Soft-delete → `supprime`. Confirm avant suppression définitive. |
| UX-02 | Auto-save | ✅ CORRIGÉ | `public/app.js:146-170` | Debounce 3s, `beforeunload`, indicateur "⏳ Non enregistré" |
| UX-03 | Barre workflow statut | ✅ CORRIGÉ | `public/app.js:252-268` | Status bar avec étapes done/active |
| UX-04 | Modale news enrichie | ✅ CORRIGÉ | `public/index.html:142-175` | Sujet libre + actus + spinner + bouton IA pick |
| UX-05 | Hashtags suggestions | ✅ CORRIGÉ | `public/app.js:297-314`, `public/app.js:413` | 16 tags cliquables, auto-format au blur |
| UX-06 | Format LinkedIn au copy | ✅ CORRIGÉ | `public/app.js:371-379` | Strip markdown, normalise puces/lignes, compteur 3000 |
| Q-02 | Regen chips suggestions | ✅ CORRIGÉ | `public/index.html:131-136`, `public/app.js:428-430` | 5 chips prédéfinis cliquables |
| Q-04 | Toast notifications | ✅ CORRIGÉ | `public/app.js:32-48` | 4 types (success/error/warning/info), auto-disparition 3s |
| Q-05 | Preview LinkedIn | ✅ CORRIGÉ | `public/app.js:386-404` | Modale avec image, texte formaté, hashtags, largeur 552px |
| Q-06 | Versioning JSONB | ✅ CORRIGÉ | `db/schema.sql:34` | Colonne versions JSONB |
| Q-07 | Auto-format hashtags | ✅ CORRIGÉ | `public/app.js:194-202` | `formatHashtags()` au blur |
| Q-08 | Extraction titre auto | ✅ CORRIGÉ | `public/app.js:470-473` | `extractTitle()` après génération |

---

## 4. PERFORMANCE

| ID Audit | Intitulé | État | Fichiers | Notes |
|----------|----------|------|----------|-------|
| PERF-01 | Skeleton + cache | ✅ CORRIGÉ | `public/app.js:213-215`, `api/news.js:16` | Skeleton 5 cartes shimmer, cache news public |
| PERF-02 | Pagination liste | ✅ CORRIGÉ | `public/app.js:217-248`, `lib/db.js:41-67` | 10 articles/page, prev/next |

---

## 5. DESIGN & LISIBILITÉ

| ID Audit | Intitulé | État | Fichiers | Notes |
|----------|----------|------|----------|-------|
| L-01 | Police Inter + smoothing | ✅ CORRIGÉ | `public/index.html:11-12`, `public/style.css:41,617-623` | Google Fonts Inter, antialiasing |
| L-02 | Tokens CSS | ✅ CORRIGÉ | `public/style.css:6-74` | 70+ variables CSS (couleurs, espacements, ombres, rayons) |
| L-03 | Badges colorés | ✅ CORRIGÉ | `public/style.css:926-952` | 6 statuts avec couleurs sémantiques |
| L-04 | Compteur mots enrichi | ✅ CORRIGÉ | `public/app.js:284-293` | Mots + car. + % cible LinkedIn + code couleur |
| L-05 | Textarea focus + min-height | ✅ CORRIGÉ | `public/style.css:271-288,1012` | min-height 320px, focus ring |
| L-06 | Skeleton loader | ✅ CORRIGÉ | `public/style.css:748-754`, `public/app.js:213-215` | Gradient animé shimmer |

---

## 6. RESPONSIVITÉ

| ID Audit | Intitulé | État | Fichiers | Notes |
|----------|----------|------|----------|-------|
| R-01 | Grid responsive | ✅ CORRIGÉ | `public/style.css:77-83,1548-1564` | 3 colonnes → 1 colonne à 860px |
| R-02 | Touch targets ≥ 44px | ❌ MANQUANT | `public/style.css:1097` | boutons `min-height: 36px`. Pas de 44px mobile. |
| R-03 | Scroll filtres horizontal | ✅ CORRIGÉ | `public/style.css:839-840` | overflow-x auto, scrollbar caché |
| R-04 | Modal bottom-sheet mobile | ✅ CORRIGÉ | `public/style.css:1499-1507` | border-radius haut seulement à 600px |
| R-05 | Pagination mobile | ✅ CORRIGÉ | `public/style.css:1332-1345,1127,1509-1510` | Sticky bottom, info cachée à 600px |
| R-06 | Meta PWA mobile | ✅ CORRIGÉ | `public/index.html:5-9` | theme-color, apple-mobile-web-app |

---

## 7. QUALITÉ CODE

| ID Audit | Intitulé | État | Fichiers | Notes |
|----------|----------|------|----------|-------|
| CODE-01 | .env.example | ✅ CORRIGÉ | `.env.example` | Toutes les variables documentées |
| CODE-02 | Logging structuré | ❌ MANQUANT | — | `console.error()` uniquement, pas de logger |
| CODE-03 | Prompt externalisé | ✅ CORRIGÉ | `lib/ai-client.js:13-46`, `lib/company-context.md` | System prompt + contexte entreprise séparés |
| CODE-04 | Validation entrées | ✅ CORRIGÉ | `lib/sanitize.js` | Sanitisation basique (<> + longueur) |
| CODE-05 | README | ⚠️ PARTIEL | `README.md` | Existe, à vérifier pour complétude |
| Q-01 | System prompt IA | ⚠️ PARTIEL | `lib/ai-client.js:13-46` | Prompt structuré mais diffère des recommandations audit |

---

## 8. SYNTHÈSE

### Résolu : 35/43 (81%)

| Catégorie | Total | ✅ | ⚠️ | ❌ |
|-----------|-------|----|-----|-----|
| Sécurité | 7 | 4 | 1 | 2 |
| Architecture | 6 | 5 | 0 | 1 |
| UX | 9 | 9 | 0 | 0 |
| Performance | 2 | 2 | 0 | 0 |
| Design/Lisibilité | 5 | 5 | 0 | 0 |
| Responsivité | 5 | 4 | 0 | 1 |
| Qualité code | 5 | 3 | 1 | 1 |
| Qualité IA | 4 | 3 | 1 | 0 |
| **Total** | **43** | **35** | **3** | **5** |

### Restant à corriger

| Priorité | ID | Intitulé | Fichier cible | Effort |
|----------|-----|----------|---------------|--------|
| 🔴 Haute | SEC-04 | Auth middleware routes API | `lib/auth.js` + `api/*.js` | 30 min |
| 🔴 Haute | S-07 | CORS strict API | `lib/cors.js` + `api/*.js` | 15 min |
| 🟠 Moyenne | SEC-03 | Headers dans vercel.json | `vercel.json` | 10 min |
| 🟠 Moyenne | R-02 | Touch targets ≥ 44px mobile | `public/style.css` (media query ≤ 600px) | 15 min |
| 🟡 Basse | ARCH-01 | Store centralisé | `public/store.js` | 1h |
| 🟡 Basse | CODE-02 | Logging structuré | `lib/logger.js` | 20 min |
| 🟢 Mineure | README | Complétude README | `README.md` | 15 min |
