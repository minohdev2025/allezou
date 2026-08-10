# Audit d'expérience — Totir

> Fait le 10 août 2026 sur l'application qui tourne, avec les données de démonstration
> réelles : trois cercles, neuf membres, et l'agenda genevois tel qu'il a été moissonné.
> Écran de 375 × 812 (le format d'un téléphone courant), thèmes clair et sombre.
>
> Tout ce qui est chiffré ici a été mesuré dans le navigateur, pas estimé.

## Corrigé dans la foulée

**Les onze points ont été traités le jour même**, et vérifiés sur l'application qui tourne.
Le reste du document est conservé tel qu'écrit : il dit ce qui n'allait pas et pourquoi, ce
qui reste utile même une fois réparé.

| Point | Avant | Après |
|---|---|---|
| 1. L'action principale de « Nous sortons » | premier lieu à 797 px, **0 lieu visible** | premier lieu à **517 px, 3 lieux visibles** ; réglages repliés au-dessus |
| 2. L'agenda s'ouvre sur dix « en cours » | 10 lignes indistinctes | **3**, triées par date de fin, le reste replié sous « Et 7 autres qui durent encore » |
| 3. On se voit sous son propre nom | « Papa de Matéo, Michael y vont » | « **Michael et vous y allez** », soi-même en dernier |
| 4. Le lien d'invitation | le texte laissait croire qu'il resterait affiché | il est dit que c'est la seule fois, et **« Refaire le lien »** reprend la portée en un geste |
| 5. Le destinataire d'une sortie | affiché, non modifiable | **cases à cocher** par cercle, zéro destinataire refusé côté serveur |
| 6. Titres et lieux bruts de l'agenda | « Musée d'art et d'histoire, Rue Charles-GALLAND 2 », titres de 5 lignes | nom du lieu seul, titres coupés à **2 lignes** |
| 7. L'accueil sans cercle | un formulaire nu | un état vide qui explique, et une porte **« J'ai reçu une invitation »** qui accepte le lien collé entier |

| 8. Le troisième onglet fourre-tout | « Cercles » menait à neuf destinations | un **quatrième onglet « Vous »** (99 px de large) prend le compte, les notifications, les lieux, la relecture et la déconnexion |
| 9. La pastille d'heure disait deux choses | « 21:18 » ou « mar 13:21 », même icône | « **jusqu'à 21:18** » et « **mar dès 13:21** », l'horloge retirée puisque les mots la remplacent |
| 10. Le « +n » se comptait deux fois | 3 visages puis « +5 avec eux » | « **5 autres familles** » — le nombre compte tout le monde |
| 11. Deux détails | un nom et rien d'autre ; 🔔/🔕 sans légende | **« 9 familles »** sur chaque cercle, et deux lignes qui séparent « décocher » de « mettre en sourdine » |

Le décompte des familles se lit exactement comme la liste des membres du cercle —
appartenances actives, comptes non supprimés, liens coupés compris. Deux façons de compter
auraient fini par afficher deux nombres différents pour le même cercle.

---

## Points forts

### Le vocabulaire ne trahit jamais l'objet

« Nous sortons », « Nous aussi », « Rentrés », « Vous y êtes », « Comme la dernière fois ».
Pas un mot d'informatique sur aucun écran. Les boutons décrivent ce que fait la famille, pas
ce que fait le logiciel — c'est rare, et c'est ce qui rend l'application compréhensible sans
explication. Les états vides suivent la même règle : « Personne n'est dehors » plutôt que
« aucun résultat ».

### « Comme la dernière fois — Parc du Gué »

La meilleure interaction de l'application. Le cas le plus fréquent — on retourne au même
endroit — coûte **une touche**, en haut de l'écran, avec le nom du lieu écrit dedans. La
plupart des applications font répéter le parcours complet.

### L'accessibilité est bonne, et c'est mesurable

| Mesure | Clair | Sombre | Seuil AA |
|---|---|---|---|
| Texte principal sur le fond | — | 17,2:1 | 4,5:1 |
| Texte secondaire sur le fond | 5,15:1 | 8,41:1 | 4,5:1 |
| Texte secondaire sur une carte | 5,27:1 | 7,13:1 | 4,5:1 |
| Vert d'action sur le fond | — | 10,93:1 | 3:1 |

Le gris secondaire est le piège habituel des interfaces « douces » : ici il passe partout,
dans les deux thèmes. **Une seule cible tactile sous 44 px** sur les écrans parcourus, et
c'est un lien de retour en bas de page.

### Tout fonctionne sans JavaScript

Les filtres de l'agenda sont des liens, les lieux sont les boutons d'envoi du formulaire de
sortie, les actions sont des formulaires. Conséquences concrètes : une recherche d'agenda se
partage par URL, un réseau lent n'empêche rien, et la page revient instantanément avec le
bouton « précédent ». C'est un choix d'architecture qui se voit à l'usage.

### Les gestes dangereux sont pliés, les gestes courants sont ouverts

Sur un cercle, « Décocher » est visible mais exclure quelqu'un et nommer un administrateur
sont derrière « Administrer cette personne ». Un bouton « exclure » à portée de pouce se
touche par accident ; celui-ci ne peut pas.

### La couleur porte de l'information sans rien enregistrer

Chaque cercle, chaque personne et chaque lieu a une teinte dérivée de son identifiant. La
même famille garde la même couleur d'un écran à l'autre et d'un téléphone à l'autre, sans
qu'aucune préférence ne soit stockée. On reconnaît un cercle avant de lire son nom.

---

## Points faibles, du plus coûteux au moins coûteux

### 1. Sur « Nous sortons », l'action principale est sous la ligne de flottaison

Le code dit « deux gestes : on arrive ici, on touche un lieu ». **Mesuré : le premier lieu
commence à 797 px sur un écran de 812.** Il en dépasse quinze pixels. La page fait 1544 px,
donc la liste des lieux occupe entièrement le deuxième écran.

Ce qu'on traverse avant d'y arriver : « Sera visible par », « Qui vient », « Combien de
temps », « À partir de quand » — dont un sélecteur de date et d'heure, le contrôle le plus
lourd du web, pour un champ dont l'aide dit « laissez vide si vous y êtes déjà ».

C'est le seul écran qui doit être rapide, et c'est le plus lent. **Remettre « Où » en
premier** : les lieux étant les boutons d'envoi, l'ordre des champs n'a aucune importance
pour le formulaire. Les réglages passent en dessous, ou derrière un « Changer quelque chose ».

### 2. L'agenda s'ouvre sur dix activités « en cours »

À l'ouverture, les dix premières lignes portent toutes la mention « en cours » : « Un été au
99 », « Horaires d'été du café-jeux », « Allianz Cinéma », des expositions et des programmes
d'été qui durent des semaines. Il était 21 h 20 — rien de tout cela n'était ouvert.

Résultat : la première chose *réellement* actionnable — « Demain, 13:30 » — arrive après un
long défilement. Et deux lignes portent le **même titre**, sans rien pour les distinguer.

> Vérification faite en base : ce ne sont pas des doublons. La Ville de Genève publie bien
> deux entrées distinctes sous « Atelier Découverte - L'École du Chocolat », commençant le
> 29 juin et le 13 juillet. Ce qui manquait n'était pas un dédoublonnage mais l'information
> qui les sépare — et la colonne de gauche affichait « en cours », c'est-à-dire rien.

Une activité datée et une saison ne sont pas le même objet et ne devraient pas se disputer
la même liste. Correctifs appliqués : tri par date de fin, repli au-delà de trois, et
**« jusqu'au 12 août » à la place de « en cours »** — ce qui distingue les deux ateliers et
dit enfin s'il reste du temps.

### 3. On se voit soi-même sous son propre nom

Dans l'agenda : « **Papa de Matéo, Michael y vont** » — alors que Papa de Matéo, c'est moi.
Sur l'écran des sorties, la même personne est appelée « Vous ». Deux écrans, deux conventions.

C'est très probablement l'origine de l'impression que le filtre « où va quelqu'un de mes
cercles » vous inclut : le filtre est juste — il ne retient que les activités où quelqu'un
d'autre est inscrit — mais dès qu'on y est aussi, **c'est son propre nom qu'on lit en
premier**, et l'écran a l'air de dire l'inverse de ce qu'il fait.

Correctif : afficher « Vous », et en dernier. Une ligne à changer
([agenda/page.tsx:277](src/app/agenda/page.tsx:277)).

### 4. Le lien d'invitation ne s'affiche qu'une fois — et le texte dit le contraire

Au moment de la création, le lien et son code QR apparaissent. Le texte ajoute : « Sa durée
et le nombre d'entrées restantes s'affichent plus bas. » Un administrateur en déduit
raisonnablement que le lien aussi est plus bas. **Il n'y est pas, et il n'y sera jamais** :
seul le condensé du jeton est enregistré, ce qui est le bon choix de sécurité.

Le parent qui écrit « j'ai perdu le lien, tu me le renvoies ? » met donc l'administrateur
devant un choix qu'il ne comprendra pas : révoquer le lien que tout le monde a déjà — et
repartir de « 0 entrée sur 6 » — ou refuser.

Deux correctifs, tous deux petits : **dire au moment de la création que c'est la seule fois**
(« copiez-le maintenant : il ne sera plus réaffiché »), et proposer un bouton « Remplacer ce
lien » qui révoque et recrée en un geste, avec ses conséquences écrites.

### 5. Le destinataire d'une sortie s'affiche mais ne se change pas

« Sera visible par : Classe de 4P, Classe de 4P — démo, Voisinage du Petit-Lancy » est bien
écrit en toutes lettres avant de publier — exactement ce que le modèle produit exige. Mais
il n'y a **aucun moyen de le modifier ici** : `declarerSortie` ne lit pas de cercles
([actions.ts:487](src/app/actions.ts:487)), il applique les réglages par défaut. Pour ne pas
envoyer une sortie au voisinage, il faut quitter l'écran, ouvrir le cercle, décocher, revenir.

C'est la seule promesse du modèle produit qui n'a pas d'écran — et c'est celle qui porte sur
la vie privée. À noter que l'inscription à une activité, elle, permet de choisir ses cercles :
l'objet central est le moins équipé des deux.

### 6. Le troisième onglet est un fourre-tout

« Cercles » contient : les cercles, la création d'un cercle, les notifications, le compte,
les enfants, les lieux, la relecture de l'agenda, la page données et la déconnexion. Neuf
destinations sous un onglet qui en annonce une.

Une application à trois onglets n'a pas de place pour un quatrième — mais le compte peut
remonter dans l'en-tête de l'écran des sorties, où il est cherché, plutôt qu'en bas d'une
liste de cercles.

### 7. Rien n'accueille celui qui arrive sans cercle

Le parcours d'entrée annonce « deux questions, et c'est fini », puis dépose sur la liste des
cercles — vide, avec un formulaire « Créer un cercle » et rien d'autre. Or créer un cercle
n'est pas la fin : c'est le début d'un chemin (créer, inviter, attendre les validations)
pendant lequel l'application ne montre rien.

Il manque aussi une porte pour **« j'ai reçu une invitation »**. Si le lien reçu par message
fonctionne, tout va bien ; s'il a été recopié de travers, il n'existe aucun endroit où le
coller. L'écran du compte en propose un pour le lien de co-parent — la même chose manque ici.

### 8. Le même emplacement dit deux choses différentes

Sur l'écran des sorties, la pastille en haut à droite affiche l'heure de **fin** pour une
sortie en cours (« 21:18 », ambre) et le jour et l'heure de **début** pour une sortie à venir
(« mar 13:21 », bleu). Même position, même icône d'horloge, sens opposé — seule la couleur
distingue, et personne n'apprend un code couleur qu'on ne lui a pas donné.

« jusqu'à 21:18 » d'un côté, « mar dès 13:21 » de l'autre : deux mots règlent la question.

### 9. Le « +n » se compte deux fois

Le repli affiche jusqu'à trois pastilles de visages **puis** « +5 avec eux », où 5 est le
nombre total. On voit trois visages et on lit « +5 » : la lecture naturelle est « trois, et
cinq de plus », soit huit. Soit afficher « 5 familles avec eux » sans pastilles, soit
n'annoncer que le reste non montré.

### 10. Les titres et les lieux de l'agenda arrivent bruts

« Atelier « Court jus »: Démonter et transformer des jouets électroniques pour en inventer de
nouveaux » occupe quatre lignes sur un téléphone. Et les lieux traînent l'adresse postale avec
les patronymes en capitales, tels que la source les publie : « Musée d'art et d'histoire, Rue
Charles-GALLAND 2 », « Quai Gustave-ADOR 66 ».

Le titre gagnerait à être coupé à l'affichage (le détail existe sur sa propre page), et le
lieu à ne garder que son nom. Le second correctif est dans l'adaptateur, pas dans l'écran.

### 11. Deux détails qui coûtent peu à réparer

- **La liste des cercles ne dit rien des cercles** : un nom, une pastille « admin », c'est
  tout. Ni le nombre de familles, ni le moindre signe de vie. Trois cercles se ressemblent
  tous.
- **Les icônes 🔔 et 🔕 de la liste des membres n'ont pas de légende**, et ressemblent au
  levier voisin — « Décocher » — qui ne fait pas du tout la même chose : l'un coupe le
  téléphone, l'autre coupe la visibilité, dans les deux sens.

---

## Ce qu'il faut retenir

Le produit est **cohérent et honnête** : le vocabulaire, les états vides, la couleur, les
contrastes et le fonctionnement sans JavaScript forment un ensemble tenu, ce qui est rare à
ce stade. Les défauts ne viennent pas d'un manque de soin, mais d'un même arbitrage poussé un
peu loin : *tout est un formulaire envoyé au serveur*. Cela rend l'application rapide et
robuste, et cela explique aussi les points 1 et 5 — un écran qui ne peut rien changer sans
recharger finit par tout empiler dans l'ordre du code plutôt que dans l'ordre du geste.

Les deux corrections qui rapportent le plus, et qui ne coûtent presque rien :

1. **Remonter les lieux en haut de « Nous sortons »** — l'écran redevient ce qu'il prétend
   être.
2. **Écrire « Vous » dans l'agenda** — un filtre qui a l'air faux redevient lisible.

Et celle qui évitera un incident : **dire que le lien d'invitation ne s'affiche qu'une fois.**
