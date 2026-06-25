# DESIGN SYSTEM — IMMEIT Articles LinkedIn

> Système de design unifié pour l'outil de génération d'articles LinkedIn IMMEIT  
> Inspiré de Linear × Notion × LinkedIn  
> Version : 2.0 · Juin 2026

---

## 1. PALETTE COULEURS

### 1.1 Couleurs de marque

| Token | Valeur | Usage |
|-------|--------|-------|
| `--clr-navy` | `#0D1B2A` | Fond sidebar, fond login |
| `--clr-navy-mid` | `#162133` | Éléments sidebar (selects) |
| `--clr-navy-light` | `#1E2E44` | Bordures sidebar |
| `--clr-linkedin` | `#0A66C2` | Actions primaires, liens, focus |
| `--clr-linkedin-hover` | `#0957a8` | Hover boutons primaires |
| `--clr-linkedin-light` | `#EBF3FC` | Bouton Copier LinkedIn, badges IA |
| `--clr-linkedin-muted` | `#D0E8F8` | Hover état secondaire LinkedIn |
| `--clr-gold` | `#D4A017` | Bouton IA / Régénération |
| `--clr-gold-light` | `#FDF4DC` | Fond bouton IA |

### 1.2 Couleurs de statut

| Statut | Token | Fond | Texte |
|--------|-------|------|-------|
| Brouillon | `--clr-draft` | `#F1F5F9` | `#64748B` |
| En révision | `--clr-review` | `#FEF3C7` | `#B45309` |
| Validé | `--clr-validated` | `#DCFCE7` | `#15803D` |
| Publié | `--clr-published` | `#EBF3FC` | `#0A66C2` |
| Archivé | `--clr-archived` | `#F3F4F6` | `#374151` |
| Supprimé | _inline_ | `#FEE2E2` | `#B91C1C` |

### 1.3 Couleurs fonctionnelles

| Token | Valeur | Usage |
|-------|--------|-------|
| `--clr-bg-page` | `#F0F4F8` | Fond de page éditeur |
| `--clr-bg-card` | `#FFFFFF` | Fond cartes / surfaces |
| `--clr-bg-input` | `#F8FAFC` | Fond inputs / zones lecture |
| `--clr-bg-hover` | `#F1F5F9` | Hover zones cliquables |
| `--clr-text-primary` | `#0F172A` | Texte principal |
| `--clr-text-secondary` | `#475569` | Texte secondaire (labels) |
| `--clr-text-muted` | `#94A3B8` | Texte atténué (dates, infos) |
| `--clr-text-inverse` | `#F8FAFC` | Texte sur fond foncé (sidebar) |
| `--clr-border` | `#E2E8F0` | Bordures par défaut |
| `--clr-border-mid` | `#CBD5E1` | Bordures inputs |
| `--clr-border-focus` | `#0A66C2` | Focus ring inputs |
| `--clr-danger` | `#DC2626` | Erreurs, suppression |
| `--clr-danger-bg` | `#FEF2F2` | Fond état danger |
| `--clr-success` | `#16A34A` | Validation, succès |
| `--clr-success-bg` | `#F0FDF4` | Fond état succès |

---

## 2. TYPOGRAPHIE

| Token | Valeur | Usage |
|-------|--------|-------|
| `--font-display` | `'Inter', system-ui, sans-serif` | Titres |
| `--font-body` | `'Inter', system-ui, sans-serif` | Corps de texte |

### 2.1 Hiérarchie des tailles

| Token | Taille | Usage |
|-------|--------|-------|
| `--text-xs` | `11px` | Labels, badges, métadonnées |
| `--text-sm` | `13px` | Corps secondaire, boutons |
| `--text-base` | `15px` | Corps principal |
| `--text-md` | `17px` | Sous-titres, titres sidebar |
| `--text-lg` | `20px` | Titres de sections |
| `--text-xl` | `24px` | Titre de page (login) |

### 2.2 Poids

| Token | Valeur | Usage |
|-------|--------|-------|
| `--weight-regular` | `400` | Corps |
| `--weight-medium` | `500` | Boutons, cartes |
| `--weight-semibold` | `600` | Labels, badges, boutons importants |
| `--weight-bold` | `700` | Titres |

### 2.3 Interlignage

| Token | Valeur |
|-------|--------|
| `--leading-tight` | `1.25` |
| `--leading-normal` | `1.5` |
| `--leading-relaxed` | `1.7` |

---

## 3. ESPACEMENTS

| Token | px | rem (base 15px) |
|-------|-----|--------|
| `--space-1` | 4px | .25rem |
| `--space-2` | 8px | .5rem |
| `--space-3` | 12px | .75rem |
| `--space-4` | 16px | 1rem |
| `--space-5` | 20px | 1.25rem |
| `--space-6` | 24px | 1.5rem |
| `--space-8` | 32px | 2rem |
| `--space-10` | 40px | 2.5rem |

---

## 4. BORDURES & OMBRES

### 4.1 Rayons

| Token | Valeur |
|-------|--------|
| `--radius-sm` | 4px |
| `--radius-md` | 8px |
| `--radius-lg` | 12px |
| `--radius-xl` | 16px |
| `--radius-pill` | 999px |

### 4.2 Ombres

| Token | Valeur | Usage |
|-------|--------|-------|
| `--shadow-card` | `0 1px 3px rgba(15,23,42,.06), 0 1px 2px rgba(15,23,42,.04)` | Cartes articles |
| `--shadow-modal` | `0 20px 60px rgba(15,23,42,.18), 0 4px 16px rgba(15,23,42,.08)` | Modales |
| `--shadow-dropdown` | `0 4px 16px rgba(15,23,42,.10)` | Toasts |

---

## 5. ANIMATIONS

| Keyframe | Propriété | Usage |
|----------|-----------|-------|
| `fadeIn` | `opacity: 0 → 1` | Modales overlay, preview |
| `fadeInUp` | `opacity: 0 → 1, translateY(8px) → 0` | Écrans, cartes |
| `slideUp` | `opacity: 0 → 1, translateY(12px) → 0` | Contenu modal |
| `slideIn` | `translateY(20px) → 0, opacity: 0 → 1` | Toasts |
| `fadeOut` | `opacity: 1 → 0` | Toasts sortie |
| `shimmer` | `background-position: 200% → -200%` | Skeleton loaders |
| `spin` | `rotate: 0 → 360deg` | Spinner IA |

Transitions : `--transition-fast: 100ms ease`, `--transition-base: 160ms ease`

---

## 6. COMPOSANTS

### 6.1 Layout global (3 colonnes)

```
┌──────────────────────────────────────────────────────┐
│  SIDEBAR (220px) │ LISTE (320px) │    ÉDITEUR (1fr)  │
│                  │               │                    │
│  Logo IMMEIT     │ Tabs statuts  │ Header (titre +   │
│  AI Selector     │ Cartes        │   statut badge)   │
│  + Nouvel art.   │ articles      │ Status bar        │
│                  │ Pagination    │ Champs édition    │
│  Déconnexion     │               │ Actions bar       │
└──────────────────────────────────────────────────────┘
```

CSS : `.app` avec `grid-template-columns: 220px 320px 1fr`

### 6.2 Badges de statut

```html
<span class="badge s-brouillon">Brouillon</span>
```

- Display `inline-flex` avec pastille ronde (6px) before
- Classes : `.s-brouillon`, `.s-en_revision`, `.s-valide`, `.s-publie`, `.s-archive`, `.s-supprime`
- Taille : `--text-xs`, semibold, `--radius-pill`

### 6.3 Cartes article (liste)

```html
<div class="article-card" data-id="123">
  <div class="article-card-top">
    <span class="num">1</span>
    <h3>Titre</h3>
    <span class="status s-brouillon">brouillon</span>
  </div>
  <div class="meta">
    <span>12 juin 2026</span>
    <span class="ia-badge">groq / model · actualité: ...</span>
  </div>
</div>
```

- Hover : `border-color: var(--clr-linkedin)`
- Animation d'entrée : `fadeInUp` avec délais progressifs (0s → .36s)

### 6.4 Filtres (tabs)

```html
<div class="filters" role="tablist">
  <button class="filter-btn active" role="tab" data-filter="">Tous</button>
  <button class="filter-btn" role="tab" data-filter="brouillon">Brouillon</button>
  ...
</div>
```

- Pills (`--radius-pill`), scrollable horizontalement
- Active : fond `--clr-linkedin`, texte blanc
- Hover : `border-color: var(--clr-linkedin)`

### 6.5 Boutons

#### 6.5.1 `.btn-primary`
- Fond : `--clr-linkedin`, texte blanc, `min-height: 36px`
- Usage : Enregistrer, Générer, Valider (CTA forts)

#### 6.5.2 `.btn-outline`
- Bordure `1px solid var(--clr-border)`, fond transparent
- Usage : Retour, Annuler, actions secondaires

#### 6.5.3 `.btn-success`
- Fond blanc, bordure `--clr-border-mid`
- Usage : Valider (statut)

#### 6.5.4 `.btn-copy-lined`
- Fond `--clr-linkedin-light`, texte `--clr-linkedin`
- Usage : Copier LinkedIn

#### 6.5.5 `.btn-ai`
- Fond `--clr-gold-light`, texte `--clr-gold`
- Usage : Régénérer (bouton magique IA)

#### 6.5.6 `.btn-danger`
- Fond transparent, texte `--clr-danger`
- Usage : Supprimer

#### 6.5.7 `.btn-sm`
- `min-height: 32px`, padding réduit
- Usage : Actions d'image, champs compacts

### 6.6 Barre d'actions éditeur

```html
<div class="editor-actions">
  <button class="btn-primary">↓ Enregistrer</button>
  <button class="btn-success">✓ Valider</button>
  <button class="btn-copy-lined">⌘ Copier LinkedIn</button>
  <button class="btn-outline">👁 Aperçu</button>
  <button class="btn-ai">✦ Régénérer</button>
  <button class="btn-archive">Archiver</button>
  <button class="btn-danger">Supprimer</button>
</div>
```

- `display: flex`, wrap, gap `--space-2`
- Séparé du contenu par `border-top`

### 6.7 Toasts

```html
<div class="toast-custom" data-type="success">
  <span>✓</span><span>Article enregistré</span>
</div>
```

- Position : `fixed`, bottom-right, `z-index: 9999`
- Types : `success` (bord vert), `error` (rouge), `info` (bleu), `warning` (orange)
- Animation entrée : `slideIn` 200ms, sortie : `fadeOut` 200ms
- Auto-disparition : 3000ms par défaut

### 6.8 Modale

```html
<div id="news-modal" class="modal hidden">
  <div class="modal-content">
    <div class="modal-header">
      <h2>Nouvel article</h2>
      <div class="modal-header-actions">
        <button class="btn-outline">&times;</button>
      </div>
    </div>
    <div class="modal-body">...</div>
    <div class="modal-loading hidden">
      <div class="modal-loading-content">
        <div class="spinner"></div>
        <p>Génération en cours…</p>
      </div>
    </div>
  </div>
</div>
```

- Overlay : fond `rgba(13,27,42,.7)` avec `backdrop-filter: blur(4px)`
- Contenu : `max-width: 560px`, `border-radius: var(--radius-xl)`
- Animation : `slideUp` 200ms
- Spinner : cercle 48px, bordure `--clr-gold` en rotation
- Mobile bottom-sheet : `border-radius: var(--radius-lg) var(--radius-lg) 0 0`

### 6.9 Skeleton loader

```html
<div class="skeleton skeleton-card"></div>
```

- Fond : gradient animé `shimmer` 1.4s
- `.skeleton-card` : hauteur 72px, `border-radius: var(--radius-md)`

### 6.10 Login

```html
<div id="login-screen">
  <div class="card">
    <img src="logo-immeit.webp" class="logo-login">
    <form id="login-form">
      <input type="password" id="login-password">
      <button class="btn-primary">Se connecter</button>
    </form>
  </div>
</div>
```

- Fond plein écran : `--clr-navy`
- Carte : `max-width: 400px`, `box-shadow: 0 32px 80px rgba(0,0,0,.35)`

### 6.11 Sidebar

```html
<aside class="sidebar">
  <div class="sidebar__logo">
    <img src="logo-immeit.webp"> <span>Articles</span>
  </div>
  <nav class="sidebar__nav">
    <div class="ai-selector-inline">...</div>
    <button class="sidebar__btn-new">+ Nouvel article</button>
  </nav>
  <div class="sidebar__footer">
    <button class="btn-logout">Déconnexion</button>
  </div>
</aside>
```

- Fond `--clr-navy`, hauteur pleine, colonne flex
- Logo : `filter: brightness(0) invert(1)` sur fond foncé
- Bouton +Nouvel article : `--clr-linkedin`

### 6.12 Status bar (workflow)

```html
<div class="status-bar">
  <span class="status-step done">✓ Brouillon</span>
  <span class="status-arrow">→</span>
  <span class="status-step active">● En révision</span>
  <span class="status-arrow">→</span>
  <span class="status-step">○ Validé</span>
  ...
</div>
```

- Workflow : Brouillon → En révision → Validé → Publié
- `.done` : fond vert, texte vert
- `.active` : fond `--clr-linkedin`, texte blanc
- Par défaut : gris clair

### 6.13 Gestion des images

```html
<div class="image-area">
  <div class="images-inline" id="edit-images">...</div>
  <div class="image-toolbar">
    <button class="btn-outline btn-sm">+ Ajouter</button>
    <button class="btn-outline btn-sm hidden">🔄 Remplacer</button>
    <button class="btn-outline btn-sm hidden">🗑 Supprimer</button>
  </div>
  <div class="image-search-box hidden">
    <input type="text" id="image-search-input">
    <div class="image-search-results"></div>
  </div>
</div>
```

- Miniatures : 140×90px, sélectionnables, crédits photo superposés
- Recherche Pexels intégrée avec résultats en grille 3 colonnes
- `.image-item.selected` : bordure `--clr-linkedin`

### 6.14 Aperçu LinkedIn

```html
<div class="linkedin-preview">
  <div>
    <div class="li-preview-header"><h3>👁 Aperçu LinkedIn</h3></div>
    <div class="li-preview-body">
      <div class="li-cover"><img src="..."></div>
      <p class="li-paragraph">...</p>
      <div class="li-hashtags"><span class="li-hashtag">#GMAO</span></div>
    </div>
  </div>
</div>
```

- Largeur max : 552px (comme LinkedIn)
- Police système : `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto`
- Superposition avec `backdrop-filter: blur(4px)`

---

## 7. FORMULAIRES & INPUTS

### 7.1 Inputs / Textarea / Select

```css
padding: var(--space-3) var(--space-4);
border: 1px solid var(--clr-border);
border-radius: var(--radius-md);
font-family: var(--font-body);
font-size: var(--text-sm);
transition: border-color var(--transition-fast);
background: var(--clr-bg-card);
color: var(--clr-text-primary);
```

- Focus : `border-color: var(--clr-border-focus)` + `box-shadow: 0 0 0 3px rgba(10,102,194,.1)`
- Textarea : `resize: vertical`, `line-height: var(--leading-relaxed)`
- Select : custom chevron via SVG background

### 7.2 Labels

```css
font-size: var(--text-xs);
font-weight: var(--weight-semibold);
color: var(--clr-text-secondary);
text-transform: uppercase;
letter-spacing: 0.06em;
```

---

## 8. COMPTEUR DE MOTS

```html
<div class="word-count">
  <span style="color:#10B981;font-weight:600">1500 mots</span>
  <span style="color:var(--color-text-light)"> · 8500 car. · 100% cible LinkedIn</span>
</div>
```

- Cible LinkedIn : 1500 mots
- Couleur : orange < 800 mots, vert 800-2000, rouge > 2000
- Pourcentage calculé par rapport à la cible

---

## 9. HASHTAGS

### 9.1 Suggestions cliquables

```html
<div class="hashtag-suggestions">
  <span class="tag-suggestion">#GMAO</span>
  <span class="tag-suggestion used">#Fiabilite</span>
</div>
```

- Pills cliquables, `.used` : bordure verte, fond vert clair
- 16 hashtags prédéfinis spécifiques maintenance industrielle

### 9.2 Auto-formatage au blur

Ajoute `#` automatiquement, supprime caractères spéciaux invalides.

---

## 10. MODÈLE DE DONNÉES

### Table `articles`

| Champ | Type | Description |
|-------|------|-------------|
| `id` | `SERIAL PRIMARY KEY` | Identifiant unique |
| `titre_interne` | `TEXT NOT NULL` | Titre interne |
| `corps` | `TEXT NOT NULL` | Corps de l'article (accroches incluses) |
| `accroche_a` | `TEXT` | Variante d'accroche A |
| `accroche_b` | `TEXT` | Variante d'accroche B |
| `hashtags` | `TEXT[]` | Tableau de hashtags |
| `source_news_titre` | `TEXT` | Titre de l'actualité source |
| `source_news_url` | `TEXT` | URL de l'actualité source |
| `source_news_source` | `TEXT` | Source RSS |
| `ia_provider` | `TEXT` | Fournisseur IA utilisé |
| `ia_model` | `TEXT` | Modèle IA utilisé |
| `generation_type` | `TEXT` | `'news'` ou `'custom'` |
| `custom_subject` | `TEXT` | Sujet libre saisi |
| `statut` | `TEXT DEFAULT 'brouillon'` | `brouillon`, `en_revision`, `valide`, `publie`, `archive`, `supprime` |
| `image_url` | `TEXT` | URL image principale |
| `image_photographer` | `TEXT` | Crédit photographe |
| `image_photographer_url` | `TEXT` | URL profil photographe |
| `image_options` | `JSONB` | Tableau d'images alternatives |
| `versions` | `JSONB DEFAULT '[]'` | Historique des versions |
| `date_creation` | `TIMESTAMPTZ` | Date de création |
| `date_validation` | `TIMESTAMPTZ` | Date de validation |
| `date_publication` | `TIMESTAMPTZ` | Date de publication |
| `date_modification` | `TIMESTAMPTZ` | Date de modification (auto) |
| `date_suppression` | `TIMESTAMPTZ` | Date de soft-delete |

---

## 11. BREAKPOINTS RESPONSIVE

| Breakpoint | Cible | Changements |
|-----------|-------|-------------|
| `≤ 1024px` | Tablet landscape | Sidebar 200px, liste 280px |
| `≤ 860px` | Tablet portrait | Passe en 1 colonne, sidebar cachée |
| `≤ 768px` | Mobile large | Layout empilé, boutons 40px min-height |
| `≤ 600px` | Mobile étroit | Modale bottom-sheet, pagination info cachée, images 100px |

---

## 12. FOURNISSEURS IA

| Provider | Endpoint | Clé | Modèles |
|----------|----------|-----|---------|
| Groq | `api.groq.com` | `GROQ_API_KEY` | Llama 3.3 70B, Llama 3.1 8B |
| OpenRouter | `openrouter.ai` | `OPENROUTER_API_KEY` | Llama 3.3 70B, DeepSeek V3/R1, Gemini 2.5 Flash Lite, Llama 4 Scout |
| Cerebras | `api.cerebras.ai` | `CEREBRAS_API_KEY` | GPT-OSS 120B, ZAI GLM 4.7 |
| Mistral | `api.mistral.ai` | `MISTRAL_API_KEY` | Mistral Small/Large, Codestral |

---

## 13. RÈGLES DE GÉNÉRATION IA

- **Sujet** : exclusivement maintenance industrielle, fiabilité, GMAO
- **Longueur** : 200–350 mots (corps uniquement)
- **Ton** : expert accessible, naturel, utilisant le "nous"/"vous"
- **Structure** : accroche A/B (hors champ corps) + contexte + 2-4 bullet points • + conseil pratique + ouverture
- **Émojis** : 4-6, pertinents (💡🔧⚙️📊🎯🏭📈✅), jamais en début de post
- **Hashtags** : 3-5 par génération
- **Refus** : réponse commence par "REFUS:" si hors périmètre
- **Format réponse** : JSON valide uniquement

---

## 14. SÉCURITÉ

- **Auth** : Cookie HttpOnly `session` avec bcrypt (via `PASSWORD_HASH`)
- **Rate limiting** : 5 req/min (génération), 10 req/min (auth), 30 req/min (articles)
- **Headers** : `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy: strict-origin-when-cross-origin`
- **Sanitisation** : Inputs nettoyés avant envoi à l'IA (strip `< >`, max 500 chars)
- **Cache** : RSS 30 min in-memory, API articles stale-while-revalidate
