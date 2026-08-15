# Ce qui vient ensuite

> Réécrit le 14 août 2026, après les sept objectifs posés à la clôture de la mise en ligne.
> Ils sont faits. Ce fichier dit maintenant ce qu'ils ont laissé derrière eux : les choses
> qu'on ne saura qu'en regardant tourner, et celles qu'on a vues sans les traiter.

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

## Ce que le premier passage en production a appris

Nuit du 14 au 15 août 2026, six sources. Cent quarante-trois activités publiées, cinquante
retenues en file. Les trois sources structurées passent entières ; les cinquante viennent
toutes des trois communes lues par le modèle.

**Trente-neuf des cinquante échouaient au même contrôle, `heure_absente`**, et c'était le
trou noté la veille : une exposition ou un marché n'a pas d'horaire, le modèle sort minuit
faute de mieux, et le contrôle refusait à juste titre une heure absente de la page. Il avait
raison sur la forme et tort sur le fond.

Une activité sans horaire annoncé est désormais une activité **de toute la journée**. Les
flux structurés le déclarent eux-mêmes (`VALUE=DATE` en iCalendar, une date sans heure en
JSON-LD) ; pour une page lue par le modèle, on le déduit de la conjonction « minuit rendu »
et « aucune heure écrite sur la page ». Le contrôle garde son rôle là où il compte : une
heure précise que la page n'écrit nulle part reste un motif de mise en file.

Une activité restée en file rejoint par ailleurs le calendrier dès qu'une lecture repasse les
contrôles. Sans cela, les trente-neuf y seraient restées pour toujours, sans qu'aucun
contrôle ne leur reproche plus rien. Une décision humaine, elle, ne se défait pas : ce qui a
été écarté ne revient pas.

## Ce qui reste ouvert

### Les seuils des contrôles sont des paris

`couverture ≥ 0.8` pour le lieu, `≥ 0.75` pour la description : deux nombres choisis sans
données. Ce qui les corrigera, c'est la file elle-même. Si elle se remplit de descriptions
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

### Ce qu'a donné le premier passage

Fait le 14 août 2026, sur les six sources actives. Cent vingt-trois activités trouvées, dont
cent deux nouvelles : quatre-vingt-cinq sont entrées seules au calendrier, dix-sept sont
retombées en file.

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

**Vernier est l'exception qui reste** : six sur dix retenues, pour date absente, heure absente
et titre reformulé. Sa liste écrit des titres sur deux lignes que le modèle recolle à sa façon.
C'est la source à reprendre en premier, et probablement une question de découpage de page plus
que de consigne.
