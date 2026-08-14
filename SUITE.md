# Ce qui vient ensuite

> Écrit le 14 août 2026, à la clôture de la mise en ligne. Sept objectifs, dans l'ordre où ils
> ont été posés. Chacun dit ce qu'il touche déjà dans le dépôt : trois d'entre eux entrent en
> collision avec quelque chose de déjà écrit, et mieux vaut le voir avant que pendant.

## 1. Une page d'accueil qui explique

Aujourd'hui `/` ne montre rien : [page.tsx](src/app/page.tsx) redirige vers `/maintenant` si on
est connecté, vers `/connexion` sinon. Quelqu'un à qui on parle d'Allezou arrive donc devant un
formulaire, sans avoir lu ce que c'est.

Il faut une page publique qui dise le pourquoi, ce qu'on peut faire, et ce que ça ne fait pas.
La matière existe dans [PRODUIT.md](PRODUIT.md), mais elle est écrite pour moi ; l'écran est
pour un parent qui n'a pas trente secondes. Le premier arbitrage est là : `/` cesse de rediriger
les visiteurs anonymes, et la connexion devient un lien sur cette page.

## 2. Les tirets cadratins

À délimiter avant de commencer : le `—` est de la typographie française ordinaire, et il est
partout dans les documents écrits avant août 2026, y compris ceux que personne ne lit à l'écran.
Ce qui sonne artificiel n'est pas le signe, c'est le rythme qu'il installe — une incise à chaque
phrase. Deux périmètres possibles :

- **Le texte vu par les parents seulement** : écrans, courriels, DONNEES.md. Le reste est de la
  documentation interne, et le tiret n'y gêne personne.
- **Tout le dépôt**, commentaires et documents compris.

Le premier est défendable, le second est cohérent. Trancher, puis remplacer par `:` quand le
tiret introduit une explication, par `-` ou une virgule quand il n'est qu'une pause, et supprimer
l'incise quand elle ne portait rien.

## 3. La page données, en français parlé

[DONNEES.md](DONNEES.md) est rendue telle quelle par `/donnees` : une seule source pour le dépôt
et pour les parents, et donc une seule chose à réécrire.

Le défaut à traquer : dire ce que la chose n'est pas avant de dire ce qu'elle est. Un parent
veut savoir ce qui est enregistré, pas ce qui ne l'est pas. La section « Ce qu'Allezou
n'enregistre pas » garde sa raison d'être sur une page de protection des données — c'est au
niveau de la phrase que le tic se corrige, pas du plan.

## 4. D'autres sources pour le canton

[seed-sources.mts](scripts/seed-sources.mts) en compte trois : Ville de Genève (JSON-LD, publiée
sans relecture), Lancy et Onex (lues par le modèle). Carouge a été vérifiée : aucun flux
structuré. Le fichier porte une limite explicite — deux communes tiennent dans un quart d'heure
de relecture par semaine, en ajouter demande d'abord d'augmenter ce budget.

L'objectif 5 fait sauter cette limite, ce qui change l'ordre : chercher les sources **après**
avoir remplacé la relecture, pas avant. Chercher d'abord les flux structurés (JSON-LD, iCal,
RSS), qui ne coûtent ni appel au modèle ni doute.

## 5. Remplacer la relecture humaine par des contrôles

Le plus délicat des sept, parce qu'il touche une promesse écrite. Le [README](README.md) dit
« Rien n'est publié sans validation humaine », et [DONNEES.md](DONNEES.md) explique aux parents
comment l'agenda se remplit. Supprimer la file de relecture oblige à réécrire ces deux phrases
en même temps que le code, sans quoi le dépôt promet ce qu'il ne fait plus.

Le levier existe déjà : `autoPublish` par source. Ce qui manque, ce sont les contrôles qui
prennent la place de l'œil humain, activité par activité. Quelques-uns qui se défendent :

- la date lue existe-t-elle sur la page d'origine, en clair ;
- le titre apparaît-il dans le texte source, ou le modèle l'a-t-il reformulé ;
- l'URL de la fiche appartient-elle bien au domaine de la source ;
- deux activités identiques à la même heure dans deux communes : signe de recopie ;
- un champ absent de la page mais présent dans la réponse — l'hallucination la plus courante.

Ce qui échoue un contrôle ne disparaît pas : il retombe dans une file, qui devient l'exception
plutôt que le passage obligé.

## 6. Être prévenu quand une activité paraît

Deux besoins distincts : un mot-clé qui apparaît dans une activité publiée, et les activités
**sur inscription**, où être prévenu tard revient à ne pas être prévenu.

Le socle est là — [notifications.ts](src/lib/notifications.ts), les abonnements push, les
réglages par cercle. Ce qui manque : des mots-clés attachés au compte, et un déclenchement au
moment de la publication plutôt qu'au moment de la sortie.

## 7. Filtrer les activités

`/agenda` filtre déjà par fenêtre, âge, commune et cercle ([calendar.ts](src/lib/calendar.ts)).
Les axes demandés — gratuit, payant, non défini, sur inscription, entrée libre — demandent
d'abord une donnée qui n'est pas collectée : ni le prix ni l'inscription ne figurent
aujourd'hui dans `RawEvent` ni dans la table `event`.

L'ordre est donc imposé : extraire ces champs à l'ingestion, migrer la table, puis filtrer.
Et prévoir « non défini » comme une valeur à part entière — sur une page communale, l'absence
de prix affiché ne veut pas dire gratuit.
