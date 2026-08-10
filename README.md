# Totir

Coordination entre parents : « nous sommes au parc du Gué jusqu'à midi » et « nous serons à
la visite du Muséum », diffusés à des cercles de confiance qui existent déjà hors de l'app.

Le **quoi** et le **pourquoi** sont dans [PRODUIT.md](PRODUIT.md). Ce fichier ne dit que le
**comment**.

## Démarrer

```bash
cp .env.example .env.local   # puis renseigner SESSION_SECRET et les clés VAPID
npm install
npm run db:up                # PostgreSQL 18 dans Docker, port 5433
npm run db:migrate
npm test
```

Générer les secrets manquants :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

```bash
npx web-push generate-vapid-keys
```

La base de test (`TEST_DATABASE_URL`) est distincte et recréée à chaque exécution :

```bash
docker exec totir-db psql -U totir -c "CREATE DATABASE totir_test OWNER totir;"
```

## Commandes

| Commande | Ce qu'elle fait |
|---|---|
| `npm test` | Toute la suite, dont les tests d'isolation |
| `npm run typecheck` | Types Next + `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:generate` | Migration SQL depuis le schéma |
| `npm run db:migrate` | Application des migrations |
| `npm run sources:seed` | Inscrit les sources d'agenda genevoises |
| `npm run sources:run` | Passe les sources et affiche leur santé |
| `npm run maintenance` | Effacements automatiques (à planifier quotidiennement) |

## Organisation

```
src/app/
  connexion/    lien magique — le jeton est consommé par un Route Handler, pas une page
  bienvenue/    nom affiché, puis enfants
  maintenant/   qui est dehors, avec le « +n » dépliable
  sortir/       deux gestes : arriver ici, toucher un lieu
  cercles/      liste, création, membres, invitations, demandes en attente
  rejoindre/    suivre une invitation — dépose une demande, ne fait entrer personne
  sortie/       détail d'une sortie : qui vient, un mot, une heure de plus
  agenda/       activités du canton et qui de vos cercles y va
  reglages/     notifications par cercle, abonnement push de cet appareil
  compte/       nom, enfants, second parent, suppression du compte
  relecture/    file de l'agenda pour qui figure dans ADMIN_EMAILS
  donnees/      rend DONNEES.md : une seule source pour le dépôt et les parents
  actions.ts    toutes les mutations, chacune ouverte par requireAccount()
  icon.tsx      l'icône, dessinée plutôt qu'embarquée en binaire

src/lib/
  db/           schéma, connexion, conversion des lignes brutes
  visibility.ts LA règle — point de passage unique de toute lecture
  auth.ts       accès sans mot de passe (lien magique)
  account.ts    suppression d'un compte
  children.ts   enfants (un prénom) et lien entre co-parents
  circles.ts    cercles, invitations, rôles, liens coupés
  publications.ts présence, participation, « rejoindre une sortie »
  places.ts     catalogue de lieux, renommage validé à plusieurs
  calendar.ts   lecture du calendrier
  notifications.ts destinataires, réglages, envoi
  ingest/       sources de l'agenda genevois
  audit.ts      journal des actes sensibles (liste blanche)
  maintenance.ts effacements automatiques
```

## Ce qu'il ne faut pas casser

**Toute lecture de publication passe par `src/lib/visibility.ts`.** Aucune autre partie du
code ne doit interroger la table `publication` directement. Le prédicat y est écrit une seule
fois et sert dans les deux sens : « que voit cette personne » et « qui voit cette
publication » — c'est ce qui garantit qu'une notification ne part jamais vers quelqu'un qui
ne verrait pas la sortie à l'écran.

Les tests de `visibility.test.ts` sont la démonstration exigée par PRODUIT.md, pas un filet
de sécurité parmi d'autres. Ils sont écrits pour être lus par quelqu'un qui ne programme pas.

**Les dates comparées viennent de l'horloge de la base**, jamais de celle de Node : quelques
millisecondes d'écart suffisent à faire sortir un membre avant son entrée, ou à afficher
« dernier apport il y a -1 jour ».

**Les requêtes SQL brutes renvoient les horodatages en chaîne.** Tout ce qui sort de
`db.execute` et annonce une `Date` passe par `src/lib/db/rows.ts`.

## Sources de l'agenda

Vérifiées le 9 août 2026.

- **Ville de Genève**, filtre « Enfants et famille » — chaque fiche expose du schema.org
  `Event` en JSON-LD. Publication automatique : rien n'est interprété.
- **Lancy, Onex** — aucun flux structuré (ni JSON-LD, ni iCal, ni RSS). Lecture par
  MiniMax M3, mise en file de relecture. Rien n'est publié sans validation humaine.

Une source qui répond correctement mais ne rapporte plus rien est signalée comme muette.
