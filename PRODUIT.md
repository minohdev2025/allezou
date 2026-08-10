# Totir — modèle produit

> Statut : validé le 9 août 2026. Ce document remplace le brief initial.
> Il fixe **quoi** et **pourquoi**. Toute décision technique qui entre en tension avec
> la section « Non négociable » perd l'arbitrage.

## L'idée

Un parent sort avec ses enfants un samedi matin. L'information « nous sommes au parc du Gué
jusqu'à midi » existe, mais ne circule nulle part : le groupe WhatsApp de la classe est le
mauvais canal pour ça — trop de monde, trop de bruit.

Totir diffuse deux signaux, et rien d'autre :

- **« nous sommes là, maintenant »** — une présence qui expire toute seule ;
- **« nous y serons »** — une inscription à une activité datée.

Vers des cercles de personnes qui se connaissent déjà hors de l'app. Ce n'est pas une
messagerie, ce n'est pas un réseau de rencontre.

## Les objets

**Compte** — personnel. Un parent, un compte. Les enfants y sont rattachés : **un prénom, rien
d'autre**. Deux parents peuvent être liés aux mêmes enfants, par invitation d'un compte à
l'autre.

**Cercle** — une liste de membres, créée par quelqu'un qui en devient administrateur.
Typiquement une classe, une école, un voisinage — l'app ne présuppose rien de cette structure.
Les membres d'un cercle se voient les uns les autres. On entre par un lien d'invitation :
un membre peut proposer quelqu'un, l'administrateur valide.

**Publication** — deux formes, un même objet :
- une *présence* : un lieu, une heure de fin, expire seule ;
- une *activité datée* : la saisir crée l'entrée au calendrier **et** y inscrit son auteur,
  en un seul geste.

Une publication nomme **les enfants présents**, par leur prénom : « la maman de Matéo est au
parc du Gué ». D'autres familles peuvent **rejoindre** une présence, avec leurs propres
enfants — c'est le « +2 » affiché à côté de la sortie, qui se déplie en une liste de noms.

**Lieu** — catalogue commun à tous. N'importe qui ajoute un lieu ; un renommage prend effet
quand plusieurs personnes le valident. La correction collective remplace la modération centrale.

**Calendrier** — canton de Genève. Les flux officiels structurés sont publiés automatiquement ;
les pages interprétées par l'IA passent par une relecture humaine avant publication. Chaque
entrée affiche sa source et sa fraîcheur. Une source en panne est **signalée**, jamais masquée
en silence.

## La règle de visibilité

C'est la seule règle qui compte, et elle doit vivre en un seul endroit du code.

> Soit une publication `P` créée par `A`, destinée à un ensemble de cercles `C(P)`.
> `B` voit `P` si et seulement si :
> 1. il existe un cercle `c ∈ C(P)` dont `A` **et** `B` sont membres **au moment de la lecture** ;
> 2. le lien entre `A` et `B` dans `c` n'est pas coupé ;
> 3. `P` n'est pas expirée.

**Le lien entre deux membres est symétrique.** Si je décoche quelqu'un, il ne me voit plus non
plus. Rien ne le lui signale : il ne peut pas distinguer « il ne publie rien » de « il m'a
masqué ». Aucune asymétrie à gérer, aucun message social involontaire.

**L'appartenance à un cercle est datée** (entrée, sortie). La règle s'évalue à la lecture, donc :
- qui quitte un cercle cesse immédiatement d'en voir les publications ;
- qui rejoint un cercle voit les présences encore actives, y compris publiées avant son arrivée.
  *(conséquence assumée de la règle — la signaler si elle gêne, mais toute exception ici
  complique la seule chose qu'on doit pouvoir prouver.)*

**Destinataires par défaut, surchargeables.** Mes réglages de cercle s'appliquent
automatiquement quand je publie ; je peux les modifier pour une sortie précise. Le destinataire
retenu doit être **écrit en toutes lettres dans le geste de publication** — un destinataire par
défaut silencieux est le moyen le plus probable de diffuser au mauvais cercle.

**Le « +n » obéit à la même règle.** Dans la liste des familles qui ont rejoint une sortie, on
ne voit que celles avec qui on partage un cercle destinataire de cette sortie — et le compteur
ne compte que celles-là. Une famille venue par le voisinage n'apparaît donc pas à un parent de
la classe qui ne la connaît pas : rejoindre une sortie ne fait jamais entrer dans le champ de
vision d'inconnus.

**Notifications** — je choisis de qui je reçois, cercle par cercle et personne par personne,
avec une mise en pause temporaire. Une notification est une divulgation comme une autre : ses
destinataires sont calculés par la règle ci-dessus, jamais par un autre chemin.

## Non négociable

- **L'isolation entre cercles doit être démontrable, pas supposée.** Une règle, un point de
  passage unique, et une batterie de tests lisible qui énumère les cas : ex-membre, membre
  arrivé après coup, publication multi-cercles, publication expirée, lien coupé, compte supprimé.
  C'est un livrable, pas une intention.
- **Pas de messagerie.** Aucun fil, aucun message libre. Attention : le risque n'est pas qu'on
  ajoute un chat, c'est qu'un champ de texte libre (nom de lieu, titre d'activité) en devienne
  un. Tout champ libre est plafonné et visible de tous.
- **Aucune géolocalisation continue.** Une présence est un lieu choisi dans une liste avec une
  heure de fin. Jamais une position transmise en arrière-plan.
- **Données enfants minimales** : un prénom. Pas de nom, pas d'âge, pas de date de naissance,
  pas de photo, pas de genre. Revenir là-dessus demande une décision explicite et écrite.
- **Aucun mot de passe.** Lien magique par e-mail pour se (re)connecter ; le lien d'invitation
  à un cercle, lui, est partagé par l'utilisateur lui-même — par WhatsApp le plus souvent.
- **Rétention courte des présences.** Une présence expirée disparaît, y compris des journaux
  techniques et des sauvegardes. Le journal d'audit trace les actes sensibles (changement de
  rôle, révocation d'invitation) et **jamais les présences** — sinon il devient exactement
  l'historique de déplacement que ce document interdit.
- **Aucun tiers commercial ne reçoit de données personnelles.** Pas d'analyse comportementale,
  pas de revente, pas de publicité.
- **Hébergement en Suisse.** C'est la phrase qu'on doit pouvoir dire à une association de
  parents : les données de vos enfants restent en Suisse.

## Hors périmètre du pilote

Paiement, commission, compte payant. Partenariat commercial actif. Messagerie. Découverte de
personnes hors des cercles existants.

Le calendrier doit pouvoir accueillir un jour des acteurs commerciaux (musées, activités
payantes) **sans que la logique de visibilité entre particuliers change** — mais le pilote
n'en contient aucun.

## Choix techniques

Next.js + PostgreSQL + TypeScript. PWA installable, avec notifications push — sur iPhone elles
n'arrivent que si l'app est ajoutée à l'écran d'accueil, ce geste doit donc être guidé.
Hébergement suisse (Infomaniak et Exoscale sont genevois), donc pas de plateforme *serverless*
américaine : un serveur Node classique, ce qui simplifie par ailleurs les tâches planifiées
d'ingestion du calendrier.

Ordre de construction : **tout le socle avant l'interface.**

## Responsable des données

**Michael Urbina**, en son nom propre — ni une entreprise, ni l'association de parents qui
relaie l'invitation. Adresse de contact : Chemin du Gué 69, 1213 Petit-Lancy. Le cadre est la
**nLPD suisse**. La page destinée aux parents est [DONNEES.md](DONNEES.md).

Ce que cela implique, et qui n'est pas rien : Totir traite bien des données personnelles
réelles — adresses électroniques, noms affichés, prénoms et années de naissance d'enfants,
déclarations de présence en temps quasi réel. Une personne physique en répond. C'est
précisément pourquoi la minimisation n'est pas une posture ici.

## Décisions prises en cours de route

- **Nom affiché** : libre, choisi par le parent (« Sophie », « Maman de Léa »), plafonné à
  60 caractères. C'est un champ de texte libre : il est vu par tout le cercle, donc soumis à
  la même vigilance que les noms de lieux.
- **Succession d'administrateur** : quand le dernier administrateur actif quitte un cercle,
  le membre le plus ancien est promu automatiquement. Un cercle n'est jamais sans personne
  capable de révoquer une invitation ou d'exclure quelqu'un.
- **Contenu des notifications** : le message envoyé au téléphone ne dit ni qui, ni où —
  seulement le nom du cercle et la nature du signal (« Classe 4P — une sortie est en cours »).
  Un téléphone posé sur une table ne doit pas apprendre à un tiers qu'une famille précise est
  à un parc précis jusqu'à midi. En contrepartie il faut ouvrir l'application pour savoir de
  quoi il s'agit : c'est un arbitrage à réévaluer si les parents trouvent la notification trop
  avare.
- **Panne d'une source d'agenda** : une source qui répond correctement mais ne rapporte plus
  aucune activité est considérée comme en panne, au même titre qu'une source en erreur. C'est
  la panne la plus traître — tout va bien techniquement pendant que le calendrier se vide.
- **L'année de naissance des enfants est supprimée.** Le brief initial la prévoyait, pour
  permettre un filtre d'âge sur l'agenda. Mais les membres d'un cercle connaissent déjà les
  enfants dont il est question, et aucune autre fonctionnalité n'en dépendait : le champ ne
  survivait qu'à une justification qu'on lui cherchait après coup. Il n'existe plus.
  Le calendrier garde en revanche la tranche d'âge **annoncée par l'organisateur** (« dès
  5 ans ») — c'est une information publique sur l'activité, affichée telle quelle. Un parent
  peut demander à l'écran de ne voir que ce qui convient à un âge donné ; cette valeur ne
  vient que de l'écran et n'est enregistrée nulle part.
- **Suppression d'un compte** : les sorties, participations, réglages, sessions, appareils,
  l'adresse électronique et le nom affiché disparaissent. Les cercles créés par la personne
  subsistent — ils appartiennent à leurs membres, pas à leur fondateur — et le journal d'audit
  garde la trace des actes en effaçant les personnes. Un enfant dont elle était le seul parent
  disparaît ; s'il a un second parent, il lui reste.
- **Rétention du journal d'audit** : 12 mois. Assez pour comprendre comment quelqu'un est entré
  dans un cercle ; au-delà, ce n'est plus de la sécurité, c'est une archive.
- **Une sortie peut être annoncée à l'avance**, jusqu'à deux semaines : « nous serons au parc
  du Gué mardi à 15h » reste une sortie, simplement datée, et n'entre pas à l'agenda public —
  celui-ci ne doit pas se remplir de sorties familiales au parc. L'écran principal gagne une
  section « À venir ». Au-delà de deux semaines, ce n'est plus une sortie mais un projet, et
  cela relève de l'agenda.
- **Durée** : trois raccourcis sous les lieux, dont un repère qui dépend de l'heure qu'il est
  (« jusqu'à 12h » le matin). 2 heures est pré-sélectionné, donc le geste reste à deux touches
  pour qui ne veut rien changer.
- **La commune d'une activité vient de sa source**, pas d'une analyse de son adresse : l'agenda
  de Lancy publie des activités à Lancy. Deviner une commune dans un texte libre produirait des
  erreurs invisibles.
- **Filtres de l'agenda** : quand, âge, commune, et « où va quelqu'un de mes cercles ». Chacun
  est un lien — l'agenda reste utilisable sans JavaScript et une recherche se partage par URL.
  L'âge choisi ne quitte jamais l'écran.
- **Les enfants présents se cochent**, ils ne sont plus attachés en silence. Une sortie où
  Léa n'est pas venue ne doit pas affirmer le contraire : c'est une inexactitude sur un
  enfant, pas un détail de confort.
- **Qui relit l'agenda** est défini par `ADMIN_EMAILS` dans la configuration du serveur, pas
  par un rôle en base. Un pouvoir de plus à modéliser, protéger et révoquer ne se justifie pas
  pour une seule personne au pilote.
- **Le jeton d'invitation ne passe pas par l'URL** : il voyage dans un cookie de cinq minutes.
  Une barre d'adresse se retrouve dans l'historique, dans les journaux et dans le référent des
  liens sortants.
- **Plafond global de vingt demandes de lien par minute.** On ne compte pas par adresse IP —
  la minimisation l'interdit — donc la limite est globale : grossière, mais elle empêche de se
  servir du serveur comme d'un relais de courrier sans rien collecter de plus.
- **Le service worker ne met rien en cache.** L'application dit qui est dehors *maintenant* ;
  servir une version périmée serait pire qu'afficher une erreur de réseau. Il n'existe que
  parce que les notifications l'exigent.
- **Les tâches tournent dans le serveur, pas dans un cron du système.** L'hébergement visé
  est un serveur Node ordinaire : une planification interne se déplace avec l'application au
  lieu de dépendre de la machine. Chaque tâche se réserve sous un verrou Postgres, et
  enregistre son heure de départ *avant* de s'exécuter — une tâche interrompue par un
  plantage ne repart donc pas en boucle. Leur dernier passage s'affiche sur l'écran de
  relecture : une promesse d'effacement automatique sans trace vérifiable n'en est pas une.
- **Une demande d'entrée réveille les administrateurs.** Sans ce signal, elle dormait jusqu'à
  ce que quelqu'un pense à ouvrir la page du cercle. Le message ne nomme pas le demandeur,
  comme tous les autres, et respecte la mise en pause du cercle — mais pas les réglages
  « sorties » et « inscriptions » : administrer un cercle n'est pas le même sujet que suivre
  ce qu'y publient les familles.
- **Un lien d'invitation porte le nombre de familles attendues**, annoncé par qui invite, et
  vaut **une semaine** par défaut. Il cesse de fonctionner une fois ce nombre atteint, même
  s'il a été transféré plus loin — et passé sa date, le cercle continue de vivre : c'est
  seulement l'entrée qui se referme, jusqu'à ce qu'un administrateur en crée un nouveau. Les
  bornes sont appliquées côté serveur et pas seulement à l'écran : une action serveur est
  joignable par une requête directe, un champ de formulaire ne protège rien.
- **Un lien d'invitation se liste et se révoque.** Il circule par message, donc hors de tout
  contrôle, et
  il circule par message, donc hors de tout contrôle : ne pas pouvoir le rappeler serait une
  porte laissée ouverte. Exclure quelqu'un et nommer un second administrateur sont repliés
  derrière « Administrer cette personne » — ces gestes sont rares, et un bouton « exclure » à
  portée de pouce se touche par accident.
- **Les liens à partager portent un code QR**, généré sur le serveur et sans aucun appel
  extérieur : confier un lien d'invitation à un service de génération d'images reviendrait à
  lui confier la clé d'entrée d'un cercle. Deux parents à la sortie de l'école se montrent un
  écran plutôt que d'épeler une adresse.
- **Une activité de l'agenda a sa page** : description, lien vers le site de l'organisateur,
  qui de vos cercles y va, et inscription avec choix des cercles destinataires. Une
  inscription se modifie sans être republiée — changer de destinataires n'est pas une
  nouvelle publication — et ne peut jamais tomber à zéro destinataire : une publication que
  plus personne ne voit doit être retirée, pas vidée en silence.
