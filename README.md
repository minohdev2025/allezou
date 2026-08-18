# Allezou

Coordination entre parents : « nous sommes au parc du Gué jusqu'à midi » et « nous serons à
la visite du Muséum », diffusés à des cercles de confiance qui existent déjà hors de l'app.

Le **quoi** et le **pourquoi** sont dans [PRODUIT.md](PRODUIT.md). Ce fichier ne dit que le
**comment**. Avant d'ouvrir l'application à de vrais parents, lire
[PRODUCTION.md](PRODUCTION.md) : ce qui doit être vrai avant, et ce qui reste à construire
après.

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
| `npm run maintenance` | Lance les tâches dues à la main (`-- tout` pour toutes) |
| `npm run demo:seed` | Deux cercles peuplés et des sorties, pour essayer l'app |

## Organisation

```
src/app/
  connexion/    lien magique : le jeton est consommé par un Route Handler, pas une page
  bienvenue/    nom affiché, puis enfants
  maintenant/   qui est dehors, avec le « +n » dépliable
  sortir/       deux gestes : arriver ici, toucher un lieu
  cercles/      liste, création, membres, invitations, demandes en attente
  rejoindre/    suivre une invitation : dépose une demande, ne fait entrer personne
  sortie/       détail d'une sortie : qui vient, un mot, une heure de plus
  agenda/       activités du canton et qui de vos cercles y va
  reglages/     notifications par cercle, abonnement push de cet appareil
  compte/       nom, enfants, second parent, suppression du compte
  relecture/    file de l'agenda pour qui figure dans ADMIN_EMAILS
  donnees/      rend DONNEES.md : une seule source pour le dépôt et les parents
  page.tsx      l'accueil public, pour qui arrive sans compte
  actions.ts    toutes les mutations, chacune ouverte par requireAccount()
  icon.tsx      l'icône, dessinée plutôt qu'embarquée en binaire

src/lib/
  db/           schéma, connexion, conversion des lignes brutes
  visibility.ts LA règle : point de passage unique de toute lecture d'autrui
  auth.ts       accès sans mot de passe (lien magique)
  account.ts    suppression d'un compte
  children.ts   enfants (un prénom) et lien entre co-parents
  circles.ts    cercles, invitations, rôles, liens coupés
  publications.ts présence, participation, « rejoindre une sortie »
  places.ts     catalogue de lieux, renommage validé à plusieurs
  calendar.ts   lecture du calendrier, filtres compris
  notifications.ts destinataires, réglages, envoi, alertes de l'agenda
  texte.ts      comparer du français sans se faire prendre par un accent
  ingest/       sources de l'agenda genevois
    ical.ts     agendas WordPress publiés en .ics
    jsonld.ts   fiches schema.org
    minimax.ts  pages sans données structurées
    controles.ts ce qui remplace la relecture humaine
    tarif.ts    prix et inscription, lus par mots exacts
  audit.ts      journal des actes sensibles (liste blanche)
  maintenance.ts effacements automatiques
```

## Ce qu'il ne faut pas casser

**Toute lecture qui montre à quelqu'un ce qu'un autre a publié passe par
`src/lib/visibility.ts`.** Le prédicat y est écrit une seule fois et sert dans les deux
sens : « que voit cette personne » et « qui voit cette publication ». C'est ce qui garantit
qu'une notification ne part jamais vers quelqu'un qui ne verrait pas la sortie à l'écran.

La phrase disait « aucune autre partie du code n'interroge la table `publication` », et ce
n'était pas vrai : dix endroits la lisent. Aucun ne montre pourtant la publication de
quelqu'un d'autre. Ils lisent soit vos propres lignes (« ma dernière sortie », « mon
inscription à cette activité »), soit le seul `author_id` ou `kind` d'une publication pour
décider si celui qui demande a le droit de la modifier. La réponse qui en sort est « c'est à
vous » ou « ce n'est pas à vous », jamais un contenu. Une règle qu'on énonce plus large
qu'elle n'est finit par n'être vérifiée nulle part : celle-ci l'est maintenant.

Deux tests s'en chargent, et ils ne font pas le même travail. `visibility.test.ts` démontre
que la règle est juste, en énumérant les cas un par un ; c'est la démonstration exigée par
PRODUIT.md, écrite pour être lue par quelqu'un qui ne programme pas.
`visibility-frontiere.test.ts` vérifie qu'on ne peut pas la contourner : il compte les
lectures directes de la table, fichier par fichier, et tombe dès qu'une nouvelle apparaît.
La question à se poser quand il tombe est écrite en tête : cette lecture montre-t-elle à
quelqu'un ce qu'un autre a publié ? Si oui, elle passe par la règle. Si non, elle s'inscrit
dans la liste avec sa raison.

**Les dates comparées viennent de l'horloge de la base**, jamais de celle de Node : quelques
millisecondes d'écart suffisent à faire sortir un membre avant son entrée, ou à afficher
« dernier apport il y a -1 jour ».

**Les requêtes SQL brutes renvoient les horodatages en chaîne.** Tout ce qui sort de
`db.execute` et annonce une `Date` passe par `src/lib/db/rows.ts`.

## Sources de l'agenda

Le canton a été passé en revue le 14 août 2026, puis le 18 août, avec les privés cette
fois.

- **Ville de Genève** : chaque fiche expose du schema.org `Event` en JSON-LD. Rien n'y est
  interprété. Son filtre « Enfants et famille » gardait 197 événements quand « Tous
  publics » en comptait 762, Fête de la rentrée comprise : la source lit donc l'agenda
  complet, et le modèle trie ce qui s'adresse aux familles — oui, non, ou doute, le doute
  partant en file. Le tri ne touche à aucun fait.
- **Plan-les-Ouates, Thônex, Versoix, Confignon, Veyrier**, par la plateforme mutualisée
  [geneve-communes.ch](https://www.geneve-communes.ch/agenda), une facette commune par
  source. Son filtre « Enfants et famille » s'est révélé plus étroit que la question qu'on
  pose (le Cinéma en plein air gratuit y est « Tous publics ») : on lit donc le flux
  complet de chaque commune, et le modèle fait le tri famille, comme ailleurs. On n'y lit
  que les communes sans porte directe, pour ne pas fabriquer de doublons.
- **Chêne-Bougeries, Laconnex, Chancy** : agenda WordPress avec le greffon « The Events
  Calendar », qui publie tout en iCalendar derrière `?ical=1`. C'est la meilleure source
  possible, et `categoriesIgnorees` écarte les séances du Conseil municipal et les levées
  d'encombrants.
- **Vernier, Lancy, Onex, Carouge, Meyrin, Grand-Saconnex, Anières, Vandœuvres,
  Collex-Bossy, Perly-Certoux, Cologny, Troinex, Russin** : aucun flux structuré. Lecture
  par MiniMax M3.
- **Lancy Centre, Balexert, Le Centre Lancy-Onex** : les centres commerciaux annoncent
  leurs animations comme les communes, sur une page de liste. Même lecture, avec un
  `lieuParDefaut` parce qu'une enseigne n'écrit pas son adresse sur chaque annonce.

Ce que les deux tours ont écarté, et pourquoi — agendas composés dans le navigateur,
iCal vides, PDF, lieux sans agenda daté — est écrit en tête de
[seed-sources.mts](scripts/seed-sources.mts).

Une source qui répond correctement mais ne rapporte plus rien est signalée comme muette.
C'était le cas de Lancy : sa liste écrit « Vendredi 14 août, 21h00 » sans année, et la
consigne donnée au modèle lui interdisait de rendre un événement dont l'année n'était pas
écrite. Seules passaient les six activités dont le titre portait un millésime. L'année
manquante se déduit maintenant de la date du jour ; le jour et le mois, eux, doivent
toujours figurer en clair sur la page, et les contrôles le vérifient.

### Ce qui remplace la relecture

Avant d'entrer au calendrier, chaque activité est confrontée au morceau de page dont elle sort
(`src/lib/ingest/controles.ts`) : la date, la date de fin et l'heure sont-elles écrites en
clair, le titre est-il recopié ou reformulé, le lieu et la tranche d'âge s'y trouvent-ils, la
fiche est-elle bien sur le domaine de la source, une autre source annonce-t-elle déjà la même
chose à la même heure.

**Le morceau de page, et non la page entière.** Une page d'agenda communal est une liste : la
date de l'activité voisine y figure aussi, et une lecture qui attribue à l'atelier de mercredi
l'horaire du marché de samedi passait tous les contrôles, chaque valeur existant quelque part.
La page est donc découpée en un bloc par activité (`blocsParActivite`), et chaque activité
n'est confrontée qu'au sien.

Le repère de découpe est l'**ancre** : les premiers mots du passage, recopiés de la page par
le modèle avec chaque activité. Elle vaut mieux qu'un titre, pour deux raisons apprises en
production : elle commence à la date quand la commune l'écrit au-dessus du titre, et elle ne
se confond pas avec une entrée de menu, « Bibliobus » figurant dans la navigation d'Onex bien
avant d'être une activité. Une ancre qu'on ne retrouve pas mot pour mot dans la page est
ignorée et le titre reprend son rôle : le modèle dit où regarder, jamais si c'est juste, sans
quoi il jugerait son propre travail. Sans repère du tout, l'activité garde la page entière, et
les contrôles retrouvent la portée qu'ils avaient avant.

**Une page, un appel.** Les pages d'une commune étaient réunies puis coupées à trente mille
caractères : une amputation silencieuse sur les grosses sources, et une seule réponse à tenir
pour cent activités — les réponses tronquées ont leur message d'erreur dans `minimax.ts`.
Chaque page est désormais lue par son propre appel, et une page qui échoue n'emporte plus les
autres.

**La fiche après la liste.** Pour les sources à `lireFiches`, la fiche de chaque activité
retrouvée est ouverte à son tour : le lien exact remplace la page de liste — c'est lui
qu'un parent veut — et la fiche apporte l'heure, la description, l'âge, le tarif que la
liste résume ou tait. Une fiche qui parle d'un autre jour ne fusionne pas (c'est une série,
la liste connaît l'occurrence) ; une fiche qui parle d'autre chose démasque un mauvais
lien, qui retombe sur la page de la source. Le texte confronté devient la somme des deux
lectures.

**La relecture croisée.** Avant sa première publication, chaque activité lue par le modèle
est relue par un second passage indépendant (`src/lib/ingest/verification.ts`) : on lui
donne le bloc d'origine et les champs extraits, il rend une certitude, les contradictions
qu'il voit, et si la page annonce une annulation — « COMPLET » à côté d'un titre laisse
tous les contrôles littéraux indifférents, c'est exactement ce qu'une relecture attrape.
Son verdict ne publie jamais rien : il ne sait que retenir en file. Une panne le rend muet
plutôt que sévère, et les contrôles déterministes restent seuls juges, comme avant lui.
`verifierIA: false` le débraye source par source.

Ce qui passe tous les contrôles est publié sans que personne n'intervienne. Ce qui en échoue
un seul attend sur `/relecture`, qui affiche le motif. La file existe toujours ; elle est
devenue l'exception.

Deux règles tiennent le reste :

- les contrôles de fidélité ne s'appliquent pas aux flux structurés, qui n'interprètent
  rien ;
- le contenu d'une activité déjà publiée n'est remplacé que par une lecture qui repasse les
  contrôles. Une source qui se met à mal lire ne peut pas réécrire en silence ce qui a été
  vérifié.

Une source qu'on vient d'ajouter garde `autoPublish: false` le temps qu'on regarde ce
qu'elle rapporte : tout passe alors par la file, contrôles ou pas.
