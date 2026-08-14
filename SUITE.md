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

## Ce qui reste ouvert

### Les activités sans horaire sortent à minuit

Une exposition annoncée « 21 juin - 21 septembre » n'a pas d'heure, et une feuille iCalendar
qui la décrit en journée entière la place à minuit. L'agenda affiche donc « 00:00 », ce qui
est faux à la lecture. Il manque la notion de journée entière, en base et à l'écran. C'est
visible dès la première activité de Chêne-Bougeries.

### Les seuils des contrôles sont des paris

`couverture ≥ 0.8` pour le lieu, `≥ 0.75` pour la description : deux nombres choisis sans
données. Ce qui les corrigera, c'est la file elle-même. Si elle se remplit de descriptions
jugées inventées alors qu'elles ne le sont pas, c'est le seuil qu'il faut bouger, pas le
contrôle.

### Une activité publiée dont la relecture échoue ne se voit nulle part

Le contenu d'une activité déjà publiée n'est remplacé que par une lecture qui repasse les
contrôles : c'est ce qui empêche une source devenue mauvaise de réécrire en silence ce qui a
été vérifié. Mais l'échec n'apparaît alors sur aucun écran, puisque `/relecture` ne montre
que ce qui n'est pas publié. Une source qui se dérègle passerait donc inaperçue jusqu'à ce
que quelqu'un compare avec le site de la commune.

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
