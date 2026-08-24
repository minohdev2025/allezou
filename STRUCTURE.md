# Structure du projet Allezou

Référence rapide pour naviguer dans le code et savoir où modifier quoi.

## Sommaire
- [Architecture en une phrase](#architecture-en-une-phrase)
- [Arbre des fichiers](#arbre-des-fichiers)
- [Où modifier le texte d'une page](#où-modifier-le-texte-dune-page)
- [Commandes utiles](#commandes-utiles)
- [Build et déploiement](#build-et-déploiement)

## Architecture en une phrase

Next.js 16 (App Router, server components) + PostgreSQL via Drizzle ORM, rendu multilingue FR/EN/ES/PT/SQ via `next-intl`. Une base de code, un déploiement Docker, un VPS Infomaniak.

## Arbre des fichiers

```
.
├── messages/                    # i18n : 5 langues, 1 fichier JSON par langue
│   ├── fr.json                  # ← français (langue par défaut)
│   ├── en.json, es.json, pt.json, sq.json
│
├── src/
│   ├── app/[locale]/            # Routes URL : /fr/..., /en/..., /es/..., /pt/..., /sq/...
│   │   ├── maintenant/          # Page principale : qui est dehors maintenant
│   │   │   ├── page.tsx
│   │   │   └── demande-notifications.tsx   # Bannière "Recevoir les alertes"
│   │   ├── sortir/              # Page "On sort" : déclarer une sortie
│   │   │   ├── page.tsx
│   │   │   ├── choix-lieu-client.tsx       # Sélection d'un lieu (liste + boutons favori/masquer)
│   │   │   ├── position-inline.tsx        # Mini-carte pour situer un lieu
│   │   │   └── lieu/
│   │   │       ├── page.tsx                # Formulaire d'ajout d'un nouveau lieu
│   │   │       └── position-client.tsx    # Carte plein écran pour le nouveau lieu
│   │   ├── agenda/               # Activités futures (sorties scolaires, anniversaires)
│   │   ├── cercles/              # Mes cercles (école, voisinage, sport)
│   │   ├── compte/               # Réglages du compte
│   │   ├── reglages/             # Réglages des notifications
│   │   ├── relecture/            # Espace relecteur (vote sur adresse, catégorie, etc.)
│   │   ├── donnees/              # Page publique : quelles données on collecte
│   │   ├── questions/            # Page publique : questions fréquentes
│   │   ├── sortie/[id]/          # Détail d'une sortie en cours
│   │   ├── actions.ts           # ⚙️ Toutes les Server Actions (formulaires)
│   │   ├── ui.tsx                # ⚙️ Composants UI réutilisables (Bouton, Carte, Icônes)
│   │   ├── carte-client.tsx      # Carte Google Maps (pour la liste des lieux)
│   │   ├── notifications-client.tsx       # Activation des notifications push
│   │   ├── layout.tsx            # Layout commun à toutes les pages
│   │   ├── globals.css           # Variables CSS globales (couleurs, rayons)
│   │   └── proxy.ts              # ⚙️ Middleware Next.js 16 (CSP, nonce)
│   │
│   ├── lib/                      # Logique métier (server-side, importable partout)
│   │   ├── account.ts            # Comptes utilisateurs (création, mise à jour)
│   │   ├── auth.ts               # Authentification (magic links)
│   │   ├── calendar.ts           # Agenda (lecture des sources ical/json-ld)
│   │   ├── categories-lieu.ts    # Catégories de lieux (parc, piscine, etc.)
│   │   ├── children.ts           # Enfants rattachés à un parent
│   │   ├── circles.ts            # Cercles (membres, invitations, rôles)
│   │   ├── db/
│   │   │   ├── schema.ts         # ⚙️ Schéma de la base (toutes les tables)
│   │   │   ├── index.ts          # Connexion PostgreSQL (pool)
│   │   │   └── rows.ts           # Helpers de lecture brute
│   │   ├── geo.ts                # Géocodage Nominatim
│   │   ├── heure.ts              # Tout ce qui touche au temps (Europe/Zurich)
│   │   ├── ingest/               # Ingestion des agendas externes (ical, json-ld)
│   │   ├── notifications.ts      # ⚙️ Cœur des notifications push
│   │   ├── passkeys.ts           # Authentification par clé physique (Yubikey, etc.)
│   │   ├── places.ts             # ⚙️ Catalogue de lieux (createPlace, definirPosition, etc.)
│   │   ├── publications.ts       # Sorties (publication, destinataires, expiration)
│   │   ├── scheduler.ts          # ⚙️ Tâches planifiées (publier, notifier, effacer)
│   │   ├── session.ts            # Cookie de session, requireAccount()
│   │   ├── texte.ts              # Helpers de texte (liste en français, normalisations)
│   │   ├── traduire.ts           # Types i18n (vérifie que les 5 langues ont les mêmes clés)
│   │   └── visibility.ts         # ⚙️ Logique critique : qui voit quoi
│   │
│   ├── i18n/                     # Configuration next-intl
│   ├── fonts/                    # Polices locales
│   ├── test/
│   │   └── helpers.ts            # Fonctions partagées par les tests (resetDatabase, etc.)
│   │
│   └── instrumentation.ts        # Hook de démarrage (charge le scheduler en prod)
│
├── drizzle/                      # Migrations SQL générées
│   └── meta/                    # Métadonnées des migrations
│
├── scripts/                      # Scripts exécutables
│   ├── deploy.sh                # 🚀 Build + push + déploiement (cf. plus bas)
│   ├── migrer.mjs               # Applique les migrations en attente
│   ├── sauvegarde.sh            # Sauvegarde PostgreSQL quotidienne
│   ├── maintenance.mts          # Tâches de maintenance manuelles
│   ├── seed-demo.mts            # Peuple la base avec des données de démo
│   └── (autres scripts d'outillage)
│
├── docs/                         # Documentation interne
├── public/                       # Assets statiques (sw.js, icônes)
├── caddy/                        # Configuration du reverse proxy
├── cloudflared/                  # Tunnel Cloudflare (optionnel)
│
├── Dockerfile                    # Image Docker du site
├── docker-compose.prod.yml       # Compose pour la prod (image: totir:latest)
├── docker-compose.yml            # Compose pour le dev local
├── next.config.ts                # Configuration Next.js
├── drizzle.config.ts             # Configuration Drizzle Kit (génération des migrations)
├── eslint.config.mjs             # Configuration ESLint
├── vitest.config.mts             # Configuration Vitest (tests)
├── package.json                  # Dépendances et scripts npm
└── tsconfig.json                 # Configuration TypeScript
```

⚙️ = fichiers où les changements structurels se font (schema, scheduler, sécurité, Server Actions)

## Où modifier le texte d'une page

Le projet a deux endroits où vit le texte : **le code** (pour les composants en dur) et **`messages/<langue>.json`** (pour ce qui est traduit via `t("...")`).

### Règle simple

- **Tu cherches un texte affiché et traduit** → il est dans `messages/fr.json` (et les 4 autres langues doivent avoir la même clé).
- **Tu cherches un texte français en dur dans le code** → il est dans le `.tsx` de la page, ou dans un commentaire.

### Index par page

| Page | Texte à modifier | Type |
|---|---|---|
| Page principale (qui est dehors) | `messages/fr.json` → `"Maintenant"` | i18n |
| Page « On sort » (déclarer une sortie) | `messages/fr.json` → `"Sortir"` | i18n |
| Filtres de la liste des lieux | `messages/fr.json` → `"ChoixLieu"` | i18n |
| Mini-carte « situer ce lieu » | `messages/fr.json` → `"Position"` | i18n |
| Page d'ajout d'un nouveau lieu | `messages/fr.json` → `"Lieu"` | i18n |
| Bannière « Recevoir les alertes » | `messages/fr.json` → `"DemandeNotifications"` | i18n |
| Agenda (sorties futures) | `messages/fr.json` → `"Agenda"` | i18n |
| Mes cercles | `messages/fr.json` → `"Cercles"` | i18n |
| Détail d'un cercle | `messages/fr.json` → `"Cercle"` | i18n |
| Réglages du compte | `messages/fr.json` → `"Compte"` | i18n |
| Réglages des notifications | `messages/fr.json` → `"NotificationsClient"` | i18n |
| Espace relecteur | `messages/fr.json` → `"Relecture"` | i18n |
| Page publique « Données collectées » | `messages/fr.json` → `"Donnees"` (page) **et** `DONNEES.md` (texte long) | mixte |
| Page publique « Questions fréquentes » | `messages/fr.json` → `"Questions"` (page) **et** `QUESTIONS.md` (texte long) | mixte |
| Navigation principale | `messages/fr.json` → `"Navigation"` | i18n |

### Cas particuliers

- **Titres longs explicatifs (DONNEES.md, QUESTIONS.md)** : ce sont des fichiers `.md` à la racine du dépôt, pas dans `messages/`. Ils sont traduits par fichier (`DONNEES.en.md`, etc.) et lus par le serveur au rendu.
- **Texte en dur dans le code** : chercher le mot dans `src/app/[locale]/`. Exemple : le bouton « Confirmer la sortie » est dans `src/app/[locale]/sortir/choix-lieu-client.tsx:374` (ligne approximative). Toujours vérifier le namespace `"ChoixLieu"` en premier.
- **Ajouter une clé i18n** : l'ajouter dans `fr.json`, puis dans les 4 autres langues (le type TypeScript `traduire.ts` garantit la cohérence des 5 langues).
- **Composants UI réutilisables (Bouton, Carte, Icônes)** : `src/app/[locale]/ui.tsx`. Les textes des composants sont passés en props depuis les pages qui les utilisent.

## Commandes utiles

Toutes les commandes se lancent depuis la **racine du dépôt** (`~/totir`).

### Vérification avant commit

```bash
npm run typecheck   # Vérifie les types TypeScript
npm run lint        # Vérifie les règles ESLint
npm test            # Lance les 515 tests
npm run build       # Construit le bundle Next.js (sans Docker)
```

Enchaîner les trois : `npm run typecheck && npm run lint && npm test`. Toujours faire ça **après un commit** aussi — la vérif du commit seul ne suffit pas, il faut re-vérifier après le commit (cf. la note dans le skill `requesting-code-review`).

### Base de données

```bash
npm run db:generate  # Génère une migration après un changement de schema
node scripts/migrer.mjs            # Applique les migrations sur la base (en dev local)
npm run db:studio   # Interface web pour explorer la base
```

### Données de démo

```bash
node scripts/seed-demo.mts            # Peuple la base avec des données de test
node scripts/seed-lieux-petit-lancy.mts   # Ajoute un jeu de lieux pour Petit-Lancy
```

### Outillage

```bash
node scripts/maintenance.mts    # Tâches de maintenance (à lancer manuellement)
node scripts/ask-codestral.sh   # Outil d'aide à la rédaction (interne)
```

## Build et déploiement

### En local (développement)

```bash
npm run dev    # Lance le serveur sur http://localhost:3000
```

### Build de l'image Docker locale (sans pousser)

```bash
docker build --platform linux/amd64 -t totir:test .
```

Vérifier que l'image se construit sans erreur avant de pousser. Le build prend ~50 secondes sur une machine correcte.

### Déploiement en production

**Pré-requis** : clé SSH configurée pour `ubuntu@allezou.ch` (un alias SSH dans `~/.ssh/config`).

**Une seule commande** depuis la racine du dépôt :

```bash
bash scripts/deploy.sh
```

Ce que fait le script (en une fois, ~2-3 minutes) :

1. Construit l'image Docker en local avec deux étiquettes :
   - `totir:latest` (ce que `docker-compose.prod.yml` attend sur le serveur)
   - `totir:<sha7>-<utc>` (étiquette informative, ex : `totir:f01b060-20260823T1430Z`)
2. Pousse le `docker-compose.prod.yml` sur le serveur (le `.env` du serveur n'est pas touché)
3. Transfère l'image via `docker save | gzip | ssh | gunzip | docker load`
4. **Sauvegarde l'image précédente en `totir:previous`** (rollback possible : `docker compose up -d totir:previous`)
5. Démarre le nouveau compose + applique les migrations Drizzle
6. Nettoie les étiquettes de version obsolètes (conserve `latest`, `previous`, et la version courante)

### Vérifications après déploiement

```bash
# 1. Site en ligne
curl -sI https://allezou.ch | head -3
# Attendu : HTTP/2 200 + Strict-Transport-Security

# 2. Image correcte sur le serveur
ssh allezou 'docker images --format "{{.Repository}}:{{.Tag}}" totir'
# Attendu : 3 lignes — latest, previous, et la version courante

# 3. Logs du container
ssh allezou 'cd /home/ubuntu/allezou && docker compose logs --tail=100 app'
```

### Rollback (si quelque chose ne va pas en prod)

```bash
ssh allezou 'cd /home/ubuntu/allezou && docker compose -f docker-compose.prod.yml up -d totir:previous'
```

### Connexion au serveur

```bash
ssh allezou                                  # Connexion simple
ssh allezou 'cd /home/ubuntu/allezou && docker compose ps'  # État des containers
```

L'alias `allezou` est défini dans `~/.ssh/config` avec la bonne clé. Sinon : `ssh ubuntu@allezou.ch`.
