# Vos données dans Allezou

Cette page dit ce qu'Allezou enregistre, pourquoi, combien de temps, et qui peut le voir.
Elle est écrite pour être lue en entier : si quelque chose n'y est pas clair, c'est un défaut
de cette page, pas de votre attention.

## Qui est responsable

**Michael Urbina**, domicilié au Petit-Lancy.

Pour toute question ou demande :

> [contact@allezou.ch](mailto:contact@allezou.ch)  
> Michael Urbina

Le traitement est soumis à la loi fédérale suisse sur la protection des données (nLPD).

## Ce qu'Allezou enregistre

Allezou traite des données personnelles, dont certaines concernent des enfants. C'est pour ça
que cette page existe.

| Donnée | Pourquoi elle existe | Combien de temps | Qui la voit |
|---|---|---|---|
| Votre adresse électronique | C'est votre seule façon de vous connecter : Allezou n'a pas de mot de passe | Tant que votre compte existe | Vous seul·e. Elle n'est jamais montrée aux autres membres |
| Le nom que vous choisissez d'afficher | Pour que les autres vous reconnaissent. Vous l'écrivez librement : « Sophie », « Maman de Léa », ce que vous voulez | Tant que votre compte existe | Les membres de vos cercles |
| Le **prénom** de vos enfants, et rien d'autre | Pour dire qui est présent à une sortie : « nous sommes au parc avec Matéo » | Tant que vous le gardez déclaré | Les membres de vos cercles, quand vous déclarez l'enfant présent |
| Vos cercles et qui en fait partie | C'est le cœur du produit | Tant que le cercle existe | Les membres du cercle concerné |
| Quel enfant est concerné par quel cercle | Pour qu'une sortie sans l'aîné ne parte pas vers sa classe | Tant que vous le gardez | Vous seul·e. Les autres membres ne le voient pas |
| Vos sorties : un lieu choisi dans une liste, une heure de fin, éventuellement un mot de 140 caractères | C'est ce que vous partagez | **Effacée 24 heures après son heure de fin** | Uniquement les cercles que vous avez choisis au moment de publier |
| Vos inscriptions aux activités de l'agenda | Pour que d'autres sachent que leur enfant y retrouvera quelqu'un | Jusqu'à 90 jours après l'activité | Uniquement les cercles que vous avez choisis |
| Vos réglages de notification | Pour ne vous déranger que quand vous l'avez demandé | Tant que votre compte existe | Vous seul·e |
| Les mots que vous surveillez à l'agenda : « piscine », « judo » | Pour vous prévenir quand une activité publiée en contient un | Tant que vous les gardez | Vous seul·e. Ils ne sont montrés à personne et ne servent à rien d'autre |
| L'adresse technique de votre téléphone pour les notifications | Pour vous envoyer les notifications | Tant que vous les acceptez | Personne : c'est un identifiant technique |
| Un journal des changements de droits (qui a fait entrer qui dans un cercle, qui a exclu qui) | Pour pouvoir comprendre un problème de sécurité | **12 mois** | Le responsable, en cas d'incident |

## Ce qu'Allezou n'enregistre pas

Chacune de ces absences se vérifie dans le code.

- **Aucun mot de passe.** Il n'en existe nulle part, donc aucun ne peut fuiter.
- **Aucune position GPS, jamais.** Une sortie est un lieu que vous choisissez dans une liste,
  avec une heure de fin. Allezou ne demande jamais sa position à votre téléphone, ni quand
  l'application est ouverte, ni en arrière-plan.
- **Aucun historique de déplacement.** Une sortie passée est effacée, pas archivée. Le
  responsable lui-même ne peut pas reconstituer où une famille est allée le mois dernier, pas
  même sous forme de statistique.
- **Aucune messagerie.** Il n'y a ni fil de discussion, ni message privé, ni commentaire.
- **Aucun outil de mesure d'audience.** Pas de Google Analytics, pas de pixel publicitaire,
  pas de traceur tiers.
- **Aucune vente, aucun partage commercial.** Vos données ne sont transmises à personne.
- **Sur vos enfants, rien d'autre qu'un prénom.** Les membres d'un cercle connaissent déjà les
  enfants dont il est question, l'app n'a rien à ajouter. Pas de nom de famille, **pas d'âge ni
  de date de naissance**, pas de photo, pas de genre, pas d'école, pas de classe, pas de santé.
  Le champ « année de naissance » a existé pendant la conception, puis a été supprimé faute
  d'un usage qui le justifie.

## Qui voit quoi, exactement

C'est le point le plus important, et il obéit à une seule règle :

> **Une personne voit votre sortie si et seulement si, au moment où elle regarde, elle est
> membre d'un des cercles auxquels vous avez adressé cette sortie, et que vous n'avez pas
> coupé le lien entre vous.**

Ce qui en découle :

- Quelqu'un qui **quitte un cercle** cesse immédiatement d'en voir les sorties.
- Quelqu'un qui **n'est pas dans le cercle** ne voit rien, et n'apprend même pas qui en fait
  partie.
- Vous pouvez **décocher une personne** dans un cercle. Elle ne voit plus vos sorties, et vous
  ne voyez plus les siennes. Rien ne le lui signale.
- Quand plusieurs familles rejoignent une même sortie, **vous ne voyez dans la liste que les
  personnes avec qui vous partagez déjà un cercle**. Une famille venue par le voisinage
  n'apparaît pas à un parent de la classe qui ne la connaît pas.
- Les **notifications** suivent exactement la même règle : vous ne pouvez pas être averti·e de
  quelque chose que vous ne verriez pas à l'écran. Et le message envoyé à votre téléphone ne
  dit ni qui, ni où, seulement le nom du cercle, pour qu'un écran verrouillé posé sur une table
  ne raconte rien.
- Les **alertes de l'agenda** sont à part, parce que l'agenda est public : tout le monde voit
  les mêmes activités. Ce qui se calcule là, ce n'est pas qui a le droit de savoir, c'est qui
  a demandé à l'être. Le message nomme alors le mot que vous surveillez, qui est le vôtre, et
  jamais le titre de l'activité.

Cette règle est écrite à un seul endroit du code, et vérifiée par une série de tests qui
énumèrent les cas un par un. C'est une démonstration, qui peut être montrée sur demande.

## Où sont les données

Sur des serveurs situés **en Suisse**. Elles ne quittent pas le pays.

Trois exceptions techniques, qui ne concernent aucune donnée personnelle :

- l'agenda est alimenté depuis des sites publics genevois (Ville de Genève, communes) ;
- les pages de ces sites qui ne publient pas d'agenda structuré sont lues par un service
  d'intelligence artificielle pour en extraire les dates. **Seules des pages web publiques lui
  sont envoyées**, jamais une donnée vous concernant. Ce qu'il en tire est ensuite confronté à
  la page d'origine : une date, un titre ou un lieu qui ne s'y retrouve pas n'apparaît pas à
  l'agenda et attend une vérification à la main ;
- l'adresse d'un parc ou d'une salle est envoyée une fois à OpenStreetMap, pour en connaître
  les coordonnées et que le lien vers une carte tombe sur le bon point. C'est l'adresse d'un
  lieu public, envoyée depuis notre serveur. **Jamais la vôtre, et jamais ce que vous
  consultez** : votre téléphone ne contacte personne d'autre que nous.

## Vos droits

Vous pouvez à tout moment :

- **voir** toutes les données qui vous concernent ;
- **corriger** ce qui est faux ;
- **supprimer** votre compte, ce qui efface vos données ;
- **retirer** un enfant, ce qui efface son prénom ;
- **demander des explications** sur n'importe quel point de cette page.

Écrivez à [contact@allezou.ch](mailto:contact@allezou.ch). Vous avez également le droit de
vous adresser au Préposé fédéral à la protection des données et à la transparence.

## Si cette page change

Toute modification vous sera annoncée dans l'application avant de prendre effet. Une
modification qui élargirait ce qui est collecté ou qui peut le voir ne sera jamais appliquée
en silence.

---

*Dernière mise à jour : 14 août 2026.*
