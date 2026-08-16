# Ce qui vient ensuite

> Réécrit le 14 août 2026, après les sept objectifs posés à la clôture de la mise en ligne.
> Ils sont faits. Ce fichier dit maintenant ce qu'ils ont laissé derrière eux : les choses
> qu'on ne saura qu'en regardant tourner, et celles qu'on a vues sans les traiter.
>
> Complété le 15 août 2026, après un audit en deux temps — le regard de quelqu'un qui arrive
> sans rien savoir, puis celui de quelqu'un qui ouvre le dépôt — et les quatorze commits qui
> en sont sortis.
>
> Repris le 16 août 2026 : la carte, dont une section expliquait l'absence, est arrivée.
> La même section dit maintenant ce qui l'a débloquée.

## Ce qui a été fait

1. **Une page d'accueil publique.** `/` ne renvoie plus les visiteurs anonymes vers le
   formulaire de connexion. Une case « ne plus afficher » range la page une fois lue, et
   `/?revoir=1` la ramène.
2. **La page données, réécrite.** Les phrases qui commençaient par la négation ont été
   retournées. Le plan n'a pas bougé.
3. **Les tirets cadratins**, dans les écrans, DONNEES.md et le README. Les documents internes
   et les commentaires gardent les leurs : c'est de la typographie française ordinaire, et
   personne ne les lit à l'écran.
4. **Dix contrôles automatiques** à la place de la relecture humaine
   ([controles.ts](src/lib/ingest/controles.ts)). Ce qui échoue retombe en file avec son
   motif, affiché sur `/relecture`.
5. **Un adaptateur iCalendar**, plus Chêne-Bougeries, Laconnex et Vernier. Le tour du canton
   et ce qu'il a écarté sont en tête de [seed-sources.mts](scripts/seed-sources.mts).
6. **Le prix et l'inscription**, lus par mots exacts, filtrables à l'agenda, « non défini »
   compris.
7. **Les alertes de l'agenda** : un mot qu'on surveille, et les activités sur inscription,
   annoncées à la publication.

## Ce qu'a donné l'audit du 15 août

Le produit se transmet de famille en famille, et non par une découverte au hasard : c'est ce
qui a fixé les priorités. Quatorze commits, quatre cent quatorze tests.

- **Deux promesses de la page données étaient fausses**, toutes deux dans le sens de la
  prudence excessive ou de l'imprécision : les inscriptions sont effacées vingt-quatre heures
  après l'activité et non « jusqu'à 90 jours », et le rattachement d'un enfant à un cercle est
  visible du second parent, pas de vous seul·e. Un test fige désormais chacune.
- **La règle de visibilité tenait ; la phrase qui la décrivait, non.** Le README annonçait
  qu'aucune autre partie du code ne lit la table des publications : dix endroits la lisent,
  tous légitimes. La phrase dit la règle réelle, et `visibility-frontiere.test.ts` refuse
  désormais toute nouvelle lecture directe non discutée.
- **Une notification pouvait nommer un cercle où le lien est coupé.** La liste des
  destinataires était juste, le titre qui l'accompagnait en disait plus que la sortie.
- **L'accroche parle de l'enfant** — « Pour que nos enfants se retrouvent dehors » — et non
  de ce que le parent surveille. L'accueil montre enfin un écran, dessiné.
- **L'invitation nomme son cercle avant la connexion**, et un lien mort se dit tout de suite
  au lieu de se découvrir après la création d'un compte. Un message tout prêt accompagne le
  lien, pour que le premier parent d'un cercle n'ait plus à improviser.
- **Une adresse fausse se corrige**, à plusieurs comme un nom, en oubliant les coordonnées
  géocodées de l'ancienne.
- **Chaque activité est confrontée à son bloc de page**, et non à toute la liste.

Deux choses n'ont pas été faites, et c'est délibéré : le port 80 reste fermé (le raisonnement
tient toujours, voir DEPLOIEMENT.md), et aucune interface n'a été refondue.

## Ce qui a été repris ensuite

Trois défauts sont apparus en regardant ce que le passage des sources fait aux activités
**déjà publiées**, toutes les six heures. Ils tenaient à une même question qu'on ne posait
pas : qu'est-ce que la source annonce *encore* ?

- **Une activité annulée restait à l'agenda.** Disparaître de la page de la commune ne
  produisait aucun signal, et une famille pouvait se déplacer pour une sortie qui n'existait
  plus. `last_seen_at` retient le dernier passage où la source l'annonçait ; après trois
  absences d'affilée (dix-huit heures), elle sort de l'agenda. Une absence isolée ne fait
  rien, une commune qui réannonce la remet, et un passage en échec ne retire jamais rien.
- **Une date corrigée créait un doublon** sur les sources lues par le modèle, dont l'identité
  contenait l'heure. Elle ne contient plus que le titre normalisé et le jour. Et le contrôle
  `doublon` regarde désormais aussi la même source, pas seulement les autres.
- **L'échec d'une relecture sur une activité publiée ne se voyait nulle part.** `/relecture`
  porte maintenant une section « publiées que la source ne confirme plus », en tête, avec deux
  gestes : « elle est juste » efface le signalement, « la retirer » la sort de l'agenda.

Une activité retirée n'est jamais effacée : les familles inscrites gardent leur inscription
et continuent de la voir, avec la mention qui va bien. L'effacer emporterait leur inscription
en silence, par la cascade.

## Ce qu'un audit de sécurité a donné

Fait le 14 août 2026, sur le code, la configuration et les dépendances. L'authentification
tient : lien magique à usage unique sous verrou, clé d'accès dont l'origine et le domaine
sont vérifiés, session hachée et revérifiée à chaque lecture. Les gardes d'autorisation sont
en place partout, aucune requête SQL n'est construite par concaténation, Postgres n'est pas
publié et les sauvegardes excluent bien les sorties.

Trois choses en sont sorties, toutes corrigées :

- **Ce qu'on lit d'un site communal n'avait pas de plafond.** Le planificateur tourne dans le
  processus du serveur web : un flux qui enfle n'aurait pas fait échouer l'ingestion, il
  aurait emporté le site. `lireTexte` s'arrête à deux mégaoctets et referme la connexion, et
  le conteneur porte désormais une limite de mémoire, qui ne dépend pas du code.
- **Le nombre de fiches suivies n'en avait pas non plus.** Deux cents au maximum, et ce qui
  est laissé de côté est dit dans le journal.
- **La chaîne de développement voyageait dans l'image de production.** Les migrations
  passaient par `drizzle-kit`, un outil de développement, ce qui obligeait à embarquer tout le
  reste avec lui. `scripts/migrer.mjs` fait le même travail avec le migrateur de
  `drizzle-orm`, qui est une dépendance de production. L'image perd 340 Mo et les quatre
  avertissements qui venaient de là.

Deux points laissés tels quels, et notés ici pour qu'on ne les redécouvre pas : `/donnees`
rend du Markdown non assaini, mais il vient d'un fichier du dépôt et la politique de sécurité
du contenu bloquerait un script injecté ; et il manque `Cross-Origin-Opener-Policy`, alors que
`frame-ancestors 'none'` couvre déjà le cadrage.

## Ce que les premiers passages en production ont appris

Deux relevés, dans l'ordre où ils ont eu lieu. Ils ne comptent pas la même chose, et c'est
la première leçon : le prochain devra écrire ce qu'il compte avant d'aligner des nombres.

### 14 août 2026 — le premier passage des six sources

Cent vingt-trois activités trouvées, dont cent deux nouvelles : quatre-vingt-cinq sont
entrées seules au calendrier, dix-sept sont retombées en file.

| Source | trouvées | publiées | en file |
|---|---|---|---|
| Ville de Genève (JSON-LD) | 30 | 9 nouvelles | 0 |
| Chêne-Bougeries (iCal) | 21 | 21 | 0 |
| Laconnex (iCal) | 12 | 12 | 0 |
| Lancy (modèle) | 24 | 19 | 5 |
| Onex (modèle) | 26 | 20 | 6 |
| Vernier (modèle) | 10 | 4 | 6 |

Les deux flux structurés passent entiers, ce qui était attendu : il n'y a rien à confronter.
Lancy, muette la veille, rapporte vingt-quatre activités.

### Nuit du 14 au 15 août 2026 — ce que l'agenda portait alors

Cent quarante-trois activités publiées, cinquante retenues en file. Les trois sources
structurées passent entières ; les cinquante viennent toutes des trois communes lues par le
modèle.

Ces nombres ne se soustraient pas à ceux de la veille : le relevé du 14 dit ce qu'un passage
a trouvé et créé, celui-ci ce que l'agenda contenait après plusieurs passages — c'est le même
corpus de cent quarante-trois que compte le commit qui a réparé les liens de fiches. Les lire
comme deux moissons ferait croire à une explosion qui n'a pas eu lieu.

**Trente-neuf des cinquante échouaient au même contrôle, `heure_absente`**, et c'était le
trou noté la veille : une exposition ou un marché n'a pas d'horaire, le modèle sort minuit
faute de mieux, et le contrôle refusait à juste titre une heure absente de la page. Il avait
raison sur la forme et tort sur le fond.

Une activité sans horaire annoncé est désormais une activité **de toute la journée**. Les
flux structurés le déclarent eux-mêmes (`VALUE=DATE` en iCalendar, une date sans heure en
JSON-LD) ; pour une page lue par le modèle, on le déduit de la conjonction « minuit rendu »
et « aucune heure écrite dans le bloc de cette activité ». Le contrôle garde son rôle là où
il compte : une heure précise que la page n'écrit nulle part reste un motif de mise en file.

*(Cette phrase disait « aucune heure écrite sur la page », et le code n'en vérifiait que la
première moitié : il regardait si minuit était écrit, pas si une heure l'était. Sur une liste,
l'horaire de la voisine suffisait de toute façon à contredire la seconde. Depuis le découpage
par activité, la conjonction se vérifie vraiment, et sur le bon morceau de page.)*

Une activité restée en file rejoint par ailleurs le calendrier dès qu'une lecture repasse les
contrôles. Sans cela, les trente-neuf y seraient restées pour toujours, sans qu'aucun
contrôle ne leur reproche plus rien. Une décision humaine, elle, ne se défait pas : ce qui a
été écarté ne revient pas.

## La carte, et pourquoi elle existe maintenant

Cette section expliquait pourquoi elle n'existait pas : montrer les parcs et les activités
ensemble suppose une carte **dans** Allezou, une carte suppose un fond, un fond vient d'un
tiers — ce que la politique de sécurité du contenu interdisait et que la promesse « aucun
traceur tiers » de DONNEES.md semblait sceller, relayer les tuiles nous-mêmes heurtant la
politique d'usage d'OpenStreetMap et la bande passante d'un VPS de 2 Go. Le raisonnement
tenait ; il supposait seulement qu'un fond se charge d'office, avec la page. C'est cette
hypothèse que le voile a fait tomber, le 16 août : **rien ne part vers Google tant que
personne n'a touché « Voir sur la carte »** — une carte qui se tait n'est pas un traceur.

L'agenda pose donc sur une carte les activités que les filtres retiennent, « Nous sortons »
les lieux du catalogue, et un lieu qu'on ajoute se géolocalise du doigt, en posant son point
([carte-client.tsx](src/app/carte-client.tsx)). Le fond vient de Google Maps plutôt que
d'OpenStreetMap, par l'argument qui justifiait hier de s'en remettre aux liens : c'est la
carte que les parents savent déjà lire — et les liens de lieu y tombent désormais aussi, sur
un repère exact, au moment du toucher. La CSP autorise les hôtes que Google documente, mais
c'est le voile qui décide : aucune de ces origines ne reçoit de requête avant le geste
([proxy.ts](src/proxy.ts)). DONNEES.md le dit aux familles dans sa section « La carte » :
Google voit la zone demandée, jamais qui regarde.

La clé (`GOOGLE_MAPS_API_KEY`) se lit à l'exécution, jamais au build ; sans elle, la carte
explique son absence et tout le reste fonctionne, liens compris. Le quota se plafonne côté
console pour que le zéro franc soit une garantie et non un espoir — le raisonnement est dans
docs/google-maps.md.

Ce qui n'a pas bougé : le géocodage reste sur Nominatim, côté serveur, une fois par adresse,
et la géolocalisation reste interdite à toute l'application par `Permissions-Policy` — la
promesse de PRODUIT.md, opposable au code même. « Autour de moi », né avec la carte, était
donc mort-né ; c'est lui qui a été retiré, pas la promesse. On se repère en pinçant la
carte, comme sur un plan papier.

## Ce qui reste ouvert

### Ce que le découpage par activité va changer, et qu'on ne saura qu'en regardant

Chaque activité est désormais confrontée à son bloc de page et non à la page entière. Deux
conséquences à surveiller au prochain passage, dans des directions opposées :

- **La file va se remplir davantage**, et c'est attendu. Un bloc est vingt fois plus court
  qu'une page : une date écrite une seule fois en tête de liste, un lieu annoncé dans le
  chapeau, une tranche d'âge commune à toutes les activités ne se retrouvent plus dans le bloc
  de chacune. Les deux seuils de couverture se resserrent donc mécaniquement, sans qu'on y ait
  touché. S'il faut les bouger, c'est maintenant qu'on le saura, et c'est le seuil qu'il faut
  bouger, pas le contrôle.
- **Vernier devrait aller mieux.** Ses titres sur deux lignes, que le modèle recolle à sa
  façon, échouaient à `titre_reformule` ; le découpage ne les répare pas, mais les trois
  autres motifs qu'elle accumulait — date absente, heure absente — venaient du voisinage.
  C'est la source à regarder en premier au prochain passage.

Ce qui ne change pas : une activité dont le titre est introuvable dans la page garde la page
entière pour bloc, et les contrôles se comportent comme avant. On ne perd rien, on gagne là où
les titres sont fidèles.

### Les seuils des contrôles sont des paris

`couverture ≥ 0.8` pour le lieu, `≥ 0.75` pour la description : deux nombres choisis sans
données, et à réobserver depuis que les blocs les resserrent. Ce qui les corrigera, c'est la
file elle-même. Si elle se remplit de descriptions
jugées inventées alors qu'elles ne le sont pas, c'est le seuil qu'il faut bouger, pas le
contrôle.

### Les descriptions inventées de Lancy et Vernier

Les listes d'agenda de Lancy et Vernier ne portent pas de description. Le modèle en écrivait
une, que le contrôle attrape. La consigne lui demande maintenant d'omettre le champ plutôt
que de résumer ; il faut regarder au prochain passage si elle suffit.

### Les sources laissées de côté

- **Chancy** et **Soral** exposent bien un `?ical=1`, mais leur feuille est vide. À reprendre
  si elle se remplit.
- **Carouge** et **Meyrin** composent leur agenda dans le navigateur : la page servie ne
  contient aucune activité, ni pour nous ni pour le modèle. Il faudrait lire l'API que leur
  page interroge, ou renoncer.
- **Onex** n'a pas été revue depuis les contrôles. Elle rapportait vingt-sept activités ;
  combien en passent maintenant, on ne le saura qu'au prochain passage.

### Vernier, l'exception qui reste

Six activités sur dix retenues au passage du 14 août, pour date absente, heure absente et
titre reformulé. Sa liste écrit des titres sur deux lignes que le modèle recolle à sa façon.
C'est la source à reprendre en premier, et probablement une question de découpage de page plus
que de consigne — le même découpage qui permettrait de confronter chaque activité à son propre
bloc plutôt qu'à la page entière.

### Questions produit ouvertes

Elles ne se règlent pas en écrivant du code, et aucune n'a de réponse aujourd'hui. Les noter
ici évite qu'elles reviennent comme des surprises.

- **Ce que deviennent les données si le responsable arrête.** Allezou n'est pas porté par une
  entreprise, et c'est ce qui rassure ; l'envers est qu'un parent confie les prénoms de ses
  enfants et son réseau réel à une personne seule, sans savoir ce qui se passe si elle
  s'arrête. DONNEES.md ne le dit nulle part. Une phrase suffirait, et elle doit être vraie :
  ce qui est promis là engage un effacement, pas une intention.
- **Les enfants qui sortent sans leurs parents.** Le vocabulaire, l'illustration et le modèle
  de publication supposent un parent qui déclare une sortie et qui y est. À onze ou treize
  ans, l'enfant sort seul et c'est le parent qui aimerait savoir qui d'autre est dehors.
  Faut-il pouvoir déclarer une sortie où l'on n'est pas soi-même ? La réponse touche à
  l'invariant « pas d'inconnus » et ne se tranche pas à la légère.
- **Ce qu'il faut observer sur l'amorçage d'un cercle.** Le produit se transmet de famille en
  famille : le premier parent d'un cercle fait le travail le plus ingrat, inviter et attendre.
  On ne sait pas encore combien de familles il faut réunir pour qu'un cercle vive, ni combien
  de jours s'écoulent entre la création et la première sortie visible par quelqu'un d'autre.
  Ce sont les deux nombres à regarder en premier quand de vraies familles arriveront, et rien
  aujourd'hui ne les mesure.
