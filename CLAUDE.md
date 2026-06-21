# Plan — Générateur d'articles LinkedIn IMMEIT

## 1. Objectif

Petite application interne permettant de :
1. Récupérer les actualités récentes en maintenance industrielle / fiabilité / GMAO.
2. Les croiser avec le contexte métier d'IMMEIT (positionnement, expertises, ton de marque).
3. Générer des brouillons d'articles LinkedIn courts et denses.
4. Permettre la relecture, l'édition et la validation des brouillons.
5. Copier le texte validé en un clic pour publication manuelle sur LinkedIn.

Usage strictement personnel (un seul utilisateur : toi), pas d'app publique.

---

## 2. Garde-fou éditorial (règle non négociable)

Tout article généré doit rester dans le périmètre :
- maintenance industrielle, fiabilité (AMDEC/RCM), GMAO/GMAO cloud, maintenance prédictive/préventive,
- digitalisation des opérations de maintenance, Industrie 4.0 appliquée à la maintenance,
- retours d'expérience génériques du secteur (pas de cas clients nommés sans validation).

Tout sujet hors de ce périmètre doit être rejeté par le prompt de génération avant même d'arriver dans l'interface (voir §6).

---

## 3. Architecture technique retenue

**Stack : Vercel (Serverless Functions Node.js) + Vercel Postgres + frontend vanilla JS.**

Pourquoi : c'est la stack que tu maîtrises déjà (immeit.com tourne sur Vercel/GitHub), zéro serveur à gérer, déploiement par simple `git push`, coût quasi nul à ce volume d'usage.

- **Repo séparé** de celui d'immeit.com (outil interne, pas de risque pour le site de prod).
- **Backend** : fonctions serverless dans `/api` (Node.js).
- **Frontend** : une seule page HTML/CSS/JS vanilla (cohérent avec ton stack actuel), pas de framework — inutile pour ce volume de fonctionnalités.
- **Base de données** : Vercel Postgres (Neon), tier gratuit largement suffisant pour un usage perso.
- **Auth** : mot de passe unique stocké en variable d'environnement + cookie de session simple (pas besoin de système multi-utilisateurs).

---

## 4. Sources d'actualités (combinaison)

Deux canaux complémentaires, pour fiabilité + fraîcheur :

**A. Recherche web via l'API Anthropic (outil `web_search`)**
Canal principal. Pas de dépendance à des flux qui changent ou cassent, toujours à jour, filtrable par requête ciblée (ex. "maintenance prédictive actualités", "GMAO nouveautés 2026").

**B. Flux RSS de veille sectorielle (secours / enrichissement)**
À tester et affiner en développement (les URL de flux RSS évoluent souvent, à vérifier à l'implémentation) :
- Plant Engineering (plantengineering.com) — maintenance & fiabilité, anglophone
- Reliabilityweb.com / Efficient Plant — fiabilité industrielle, anglophone
- Techniques de l'Ingénieur — rubrique actualité industrielle, francophone

**Filtrage par mots-clés** avant transmission au générateur : AMDEC, RCM, fiabilité, GMAO, maintenance prédictive, maintenance préventive, Industrie 4.0, jumeau numérique, IoT industriel, maintenance conditionnelle.

---

## 5. Contexte entreprise (grounding)

Un fichier statique `lib/company-context.md`, injecté systématiquement dans le prompt de génération. Point de départ (à enrichir avec le contenu réel du site) :

```markdown
# Contexte IMMEIT

P2M-IMMEIT — cabinet de conseil en méthodes de maintenance et performance
industrielle, fondé en 2024.

Expertises :
- Ingénierie de fiabilité (AMDEC, RCM)
- Déploiement de GMAO (Coswin, SAP PM, Maximo, CARL, DIMOMAINT)
- Digitalisation des processus de maintenance

Implantation : Dakar (Keur Massar) et Paris, opérations au Mali et en
Côte d'Ivoire.

Cible : groupes industriels, directions maintenance, responsables fiabilité.

Ton de marque : expert mais accessible, orienté terrain, pas de jargon
gratuit, toujours relié à un bénéfice concret pour le lecteur.
```

---

## 6. Génération de contenu — règles

Appel à l'API Anthropic avec un system prompt strict. Squelette :

```
Tu rédiges des posts LinkedIn pour IMMEIT (contexte joint).
Contraintes strictes :
- Sujet exclusivement lié à la maintenance industrielle / fiabilité / GMAO.
  Si l'actualité fournie sort de ce périmètre, refuse et explique pourquoi.
- Longueur : 150 à 250 mots (format post LinkedIn, pas article long-form).
- Structure : accroche forte dans les 2 premières lignes (avant le "voir plus"),
  un angle d'expertise IMMEIT, un conseil actionnable, une question ou
  ouverture en fin de post (pas de CTA commercial appuyé).
- Densité : chaque phrase apporte une information, pas de remplissage.
- Pas d'emoji excessif (2-3 maximum si pertinent).
- Génère 2 variantes d'accroche pour choix.
```

Entrée du prompt = actualité sélectionnée + `company-context.md`.
Sortie = JSON structuré `{titre_interne, accroche_a, accroche_b, corps, hashtags}`.

---

## 7. Workflow de validation

Statuts : `brouillon → en_revision → valide → publie → archive`

Interface (une seule page) :
- Liste des articles filtrable par statut.
- Vue édition : champ texte modifiable (titre interne + corps), bouton "régénérer" (relance l'IA avec consignes complémentaires), bouton "valider".
- Une fois validé : bouton "Copier pour LinkedIn" (Clipboard API) → passe automatiquement le statut à `publie` avec horodatage.
- Génération manuelle déclenchée par un bouton "Nouvel article" (tu choisis l'actualité source parmi une shortlist proposée, ou tu laisses l'IA choisir).

---

## 8. Modèle de données

```sql
CREATE TABLE articles (
  id SERIAL PRIMARY KEY,
  titre_interne TEXT NOT NULL,
  corps TEXT NOT NULL,
  hashtags TEXT[],
  source_news_titre TEXT,
  source_news_url TEXT,
  statut TEXT NOT NULL DEFAULT 'brouillon',
  date_creation TIMESTAMP DEFAULT now(),
  date_validation TIMESTAMP,
  date_publication TIMESTAMP
);
```

---

## 9. Structure du projet

```
immeit-articles/
├── api/
│   ├── news.js          # recherche web + RSS, filtrage mots-clés
│   ├── generate.js       # appel Claude, combine news + contexte
│   └── articles.js       # CRUD (liste, update statut, edit)
├── public/
│   ├── index.html
│   ├── app.js
│   └── style.css
├── lib/
│   ├── company-context.md
│   ├── claude-client.js
│   └── rss-fetcher.js
├── db/
│   └── schema.sql
├── vercel.json
├── package.json
└── .env.example
```

---

## 10. Variables d'environnement

```
ANTHROPIC_API_KEY=
DATABASE_URL=        # fourni par Vercel Postgres
ADMIN_PASSWORD=
```

---

## 11. Roadmap

**Phase 1 — MVP**
Génération manuelle (1 bouton, 1 actualité, 1 brouillon), édition simple, copier-coller, pas encore de gestion de statuts avancée.

**Phase 2**
Workflow de statuts complet, historique, filtres, régénération avec retours.

**Phase 3**
Vercel Cron hebdomadaire : génère automatiquement 1-2 brouillons par semaine pour que tu n'aies qu'à valider.

**Phase 4 (optionnel, plus tard)**
Publication automatique via API LinkedIn (OAuth) — non prioritaire, tu as choisi le copier-coller manuel pour l'instant.

---

## 12. Prochaines étapes

Ce fichier est prêt à être injecté tel quel comme contexte de démarrage dans OpenCode pour bootstrap le repo (init projet Vercel, schéma DB, premières routes API).
