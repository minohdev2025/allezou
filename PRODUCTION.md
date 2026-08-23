# Passer en production

> Note écrite le 10 août 2026, à l'issue du pilote local et de la démonstration par tunnel.
>
> [DEPLOIEMENT.md](DEPLOIEMENT.md) dit **comment** installer l'application sur une machine.
> Ce document dit **ce qui doit être vrai avant que de vrais parents s'en servent**, et ce qui
> reste à construire ensuite. Les deux se lisent ensemble ; celui-ci se lit en premier.

Le pilote a répondu à la question qu'il posait : la règle de visibilité tient, l'application
s'installe sur un téléphone, l'agenda se remplit tout seul. Ce qui suit n'est pas une liste de
finitions — c'est la différence entre une démonstration que je conduis moi-même et un service
dont des familles dépendent.

---

## 1. Le nom de domaine

**Décision : `allezou.ch`**, pris chez Infomaniak — qui vend le `.ch` et où les zones sont déjà
gérées — et **déjà pointé sur le VPS**.

`sortir.fun` était réservé, `sortir.app` a été envisagé pour son préchargement HSTS, et
`totir.ch` a été la décision précédente — du temps où l'application s'appelait Totir. Elle
s'appelle Allezou : le domaine dit désormais le nom, exactement, et plus personne n'a de
correction à faire en le répétant.

Reste l'arbitrage du `.ch` contre le `.app`, et il tient en une phrase : **l'avantage du `.app`
s'obtient sur `.ch` ; l'inverse est faux.** Le préchargement HSTS d'un `.app` est acquis
d'office, alors que sur `.ch` il coûte *une* soumission (voir plus bas). Un `.app`, lui, ne dira
jamais « Suisse » dans la barre d'adresse — et c'est le seul argument qu'Allezou possède face à
une association de parents. La barre d'adresse est lue par tout le monde ;
[DONNEES.md](DONNEES.md) par presque personne.

L'adresse de démonstration par tunnel nommé est abandonnée, et le tunnel avec elle :
`allezou.ch` pointe sur le VPS, et un même nom ne peut pas être servi des deux côtés. Une
démonstration depuis un poste passe désormais par un tunnel éphémère
([DEPLOIEMENT.md](DEPLOIEMENT.md)). Une seule adresse, donc, et définitive — la section suivante
dit ce que coûterait d'en changer.

### Changer de domaine invalide des choses, silencieusement

Tout est dérivé d'une seule variable, `APP_URL` — c'est la bonne nouvelle : il n'y a qu'un
endroit à changer. Mais quatre choses sont **liées à l'origine** et ne survivent pas au
changement :

| Ce qui casse | Pourquoi | Ce que voit la personne |
|---|---|---|
| **Les clés d'accès** | Une clé WebAuthn ne vaut que pour un nom d'hôte ([passkeys.ts](src/lib/passkeys.ts) `domaine()`). C'est exactement ce qui la rend inutilisable sur un site d'hameçonnage | « Cet appareil n'est enregistré sur aucun compte » |
| **Les abonnements push** | Le service worker de la nouvelle origine est une autre installation | Plus aucune notification, sans message d'erreur |
| **L'app ajoutée à l'écran d'accueil** | Elle pointe sur l'ancienne origine | Une icône qui ouvre un site mort |
| **Les codes QR et liens d'invitation déjà partagés** | Ils portent l'ancienne adresse en clair | Un lien qui ne mène nulle part |

**Conséquence pratique : `allezou.ch` est définitif.** Le changement se fait aujourd'hui sans
rien coûter — les seuls comptes existants sont des comptes de démonstration — et il doit être le
dernier : passé la première invitation à de vrais parents, chaque bascule coûte une
réinscription à tout le monde. Et si une bascule devenait inévitable un jour, garder l'ancien
domaine en redirection permanente et prévenir dans l'application : une redirection 301 sauve
les liens, pas les clés d'accès ni les notifications.

### HSTS : une soumission à faire, une seule fois

L'en-tête `Strict-Transport-Security` est déjà servi avec les bonnes valeurs
([next.config.ts](next.config.ts)) : `max-age` de deux ans, `includeSubDomains`, `preload`.
Sur `.app` il était décoratif — le TLD entier est préchargé dans les navigateurs. **Sur `.ch`,
il devient la protection réelle**, et un en-tête ne protège qu'à partir de la *deuxième* visite.

Il faut donc soumettre `allezou.ch` à [hstspreload.org](https://hstspreload.org) une fois en
ligne. Les conditions sont remplies par la configuration prévue :

- certificat valide et service en HTTPS — **après déploiement seulement** (voir plus bas)
- en-tête conforme sur le domaine apex ✔
- redirection depuis HTTP **seulement si le port 80 écoute** — or il reste fermé
  ([DEPLOIEMENT.md](DEPLOIEMENT.md)), ce qui satisfait la condition sans rien faire, et
  n'empêche pas Caddy d'obtenir son certificat (défi TLS-ALPN sur 443).

**Soumettre avant le déploiement ne sert à rien**, et le message d'erreur induit en erreur :
« Invalid Certificate Chain » ne parle pas du VPS. `allezou.ch` résout encore vers un
hébergement Infomaniak — un Apache qui présente un certificat auto-signé `CN=localhost` —
tandis que le VPS n'écoute que sur 22. L'ordre est donc : repointer la zone sur le VPS,
déployer derrière Caddy, vérifier la chaîne (`openssl s_client -connect allezou.ch:443
-servername allezou.ch`, ou [SSL Labs](https://www.ssllabs.com/ssltest/)), et soumettre
ensuite.

**En ligne depuis le 14 août 2026**, et les conditions sont réunies : certificat Let's Encrypt
obtenu par défi TLS-ALPN, chaîne complète jusqu'à ISRG Root X2, `Verify return code: 0`, sur
`allezou.ch` comme sur `www.allezou.ch`. Ce dernier redirige vers l'apex en 301
([caddy/Caddyfile](caddy/Caddyfile)) et sert le même en-tête — sans quoi `includeSubDomains`
préchargerait une promesse qu'un sous-domaine ne tient pas.

Entre la mise en ligne et l'entrée effective dans les navigateurs — quelques semaines —
la toute première visite d'un parent reste théoriquement interceptable. Sur un pilote de
quelques classes, c'est un risque de laboratoire ; il cesse d'en être un si l'usage s'étend.

---

## 2. Sécurité — ce qui est déjà en place

À dire tel quel si quelqu'un pose la question, parce que c'est vérifiable dans le code :

- **Aucun mot de passe n'existe** — donc aucun ne peut fuiter, ni être réutilisé ailleurs.
- **Clés d'accès** liées au domaine : inutilisables sur un site d'hameçonnage, avec compteur
  anti-rejeu. Aucun secret partagé.
- **Le cookie de session ne contient qu'un jeton opaque** : ni identifiant, ni rôle. Tout est
  relu en base à chaque requête, donc un départ de cercle prend effet immédiatement.
- **Politique de sécurité du contenu à nonce par requête** avec `strict-dynamic`
  ([proxy.ts](src/proxy.ts)) : une balise script injectée n'aurait pas le nonce du moment.
- **`Permissions-Policy: geolocation=()`** — la promesse « aucune géolocalisation » rendue
  opposable par le navigateur, et non pas seulement écrite.
- **Le jeton d'invitation ne passe pas par l'URL** : cookie de cinq minutes, pour ne pas le
  retrouver dans un historique, un journal d'accès ou un en-tête `Referer`.
- **Le lien coupé entre deux personnes est symétrique par construction** : une contrainte
  `check` en base l'impose, ce n'est pas une convention applicative.
- **La règle de visibilité est écrite une seule fois** ([visibility.ts](src/lib/visibility.ts))
  et sert dans les deux sens — « que voit cette personne » et « qui voit cette publication ».
  C'est ce qui garantit qu'une notification ne peut pas partir vers quelqu'un qui ne verrait
  pas la sortie à l'écran.
- **Le journal d'audit fonctionne par liste blanche** : il trace les changements de droits, et
  ne peut pas tracer une sortie même par accident.
- **`ADMIN_EMAILS` n'ouvre que la file de relecture de l'agenda** et la santé des tâches —
  aucune donnée de parent, aucune sortie. Il n'existe pas de rôle « administrateur » en base.

## 3. Sécurité — ce qui manque, par ordre de gravité

### a. Le planificateur — silencieux quand il ne tourne pas

[PRODUIT.md](PRODUIT.md) promet qu'une présence est **effacée 24 heures après son heure de fin**.
Cet effacement a lieu dans [maintenance.ts](src/lib/maintenance.ts), appelé par
[scheduler.ts](src/lib/scheduler.ts), qui ne tourne que si la variable `SCHEDULER` le permet.

**Aujourd'hui, le piège est refermé** :
- `docker-compose.prod.yml` pose `SCHEDULER: ${SCHEDULER:-1}` — la valeur par défaut est `1`.
- `schedulerActive()` dans `src/lib/scheduler.ts` traite `SCHEDULER=1` et `SCHEDULER=0`
  explicitement, et bascule sur `true` quand `NODE_ENV=production` (posé par le Dockerfile).

**La garde qui reste** : une application qui tournerait avec `SCHEDULER=0` accumule indéfiniment
les présences, les sessions expirées et le journal d'audit, tout en affichant aux parents qu'elle
les efface. **Le dernier passage de chaque tâche s'affiche sur l'écran de relecture** — c'est là
qu'il faut regarder le premier jour, puis une fois par mois. Si un jour cette page se vide
silencieusement, c'est ici que ça se passe.

### b. Le courriel — SPF, DKIM, DMARC

Sans SMTP, personne ne se connecte. Mais brancher le SMTP ne suffit pas : un lien magique qui
arrive dans les indésirables, c'est un parent qui abandonne sans jamais le dire. Sur un domaine
neuf, sans enregistrements d'authentification, c'est le cas par défaut.

Les trois enregistrements DNS (SPF, DKIM, DMARC) sont à poser **en même temps** que le compte
d'envoi Infomaniak, et à vérifier en s'envoyant un lien vers une adresse Gmail et une adresse
Outlook — les deux que les parents utiliseront. C'est la panne la plus probable du premier jour,
et la plus silencieuse.

### c. Ce qu'il faut dire tout haut : la boîte aux lettres est la clé

Avec une connexion par lien magique, **quiconque lit la boîte électronique d'un parent entre
dans son compte**. C'est la réponse honnête à « c'est sécurisé ? » : le niveau de sécurité de
Allezou est celui de la messagerie du parent, pas le nôtre.

Les clés d'accès réduisent la surface — un habitué n'utilise plus le courriel — mais la
récupération reste la boîte aux lettres, et c'est intentionnel : un téléphone perdu ne doit pas
fermer un compte. Ce qu'il reste à faire :

- écrire cette phrase dans [DONNEES.md](DONNEES.md), au lieu de laisser croire que l'absence de
  mot de passe est une sécurité pure ;
- rendre visible dans « Votre compte » qu'une session est ouverte ailleurs, et permettre de
  toutes les fermer. Aujourd'hui une session dure **180 jours** et rien ne la liste. Sur une
  tablette familiale prêtée, c'est long.

### d. Une adresse de contact réelle

**Fait : `contact@allezou.ch`**, dans [DONNEES.md](DONNEES.md) et derrière « Nous écrire », au
bas de l'écran « Vous ». C'est aussi l'expéditeur des liens de connexion (`SMTP_FROM`) : une
seule boîte, sans adresse « ne pas répondre » — un parent qui répond au courriel qui l'a fait
entrer écrit donc à quelqu'un.

Il reste à la créer chez Infomaniak et à la relever. Une adresse annoncée qui ne répond pas est
pire que l'adresse postale qu'elle remplace, parce qu'elle promet une réponse rapide.

Dans le même mouvement : le droit d'accès est aujourd'hui satisfait *écran par écran* (compte,
cercles, réglages). Il n'existe pas d'export en un geste. Un bouton « télécharger mes données »
produisant un JSON est une demi-journée de travail, et il transforme une promesse en preuve.

### e. Le plafond global de demandes de liens

Vingt demandes par minute, **toutes adresses confondues**
([auth.ts](src/lib/auth.ts) `MAGIC_LINK_MAX_PAR_MINUTE`). C'était le bon compromis pour ne rien
collecter de plus, et c'est tenable à trente familles. À la rentrée, avec trois cents parents
qui reçoivent l'invitation le même soir, ce plafond devient un déni de service que l'on
s'inflige à soi-même : le vingt-et-unième parent voit « service saturé » et n'insiste pas.

À revoir avant la première invitation de masse : plafond par adresse (déjà présent : une
demande par minute et par adresse) **plus** un plafond global nettement relevé, ou une file
d'attente d'envoi.

### f. Les sauvegardes — tranché

Les tables de publications sont exclues du `pg_dump` : la promesse d'effacement de DONNEES.md
tient, et ce qui a de la valeur est sauvegardé quand même. Une minuterie systemd lance
[scripts/sauvegarde.sh](scripts/sauvegarde.sh) chaque nuit sur le serveur ; détail dans
[DEPLOIEMENT.md §4](DEPLOIEMENT.md).

Reste la destination, et elle est **reportée sciemment** : les copies sont sur le disque du
serveur, donc une panne de ce disque les emporte avec la base. Le pari tient tant que le pilote
tourne — ce qui existe aujourd'hui se recrée en une soirée. Il cesse de tenir au premier groupe
de parents : à partir de là, perdre le disque, c'est demander à des familles de tout refaire,
réinvitations comprises. C'est le moment convenu pour brancher S3 Swiss Backup, et il demande
les identifiants du compte.

À noter quand même : la sauvegarde locale nocturne couvre déjà l'accident le plus probable —
une migration ratée, un effacement de trop. Seule la panne du disque lui-même reste à découvert.

### g. Journaux d'accès du proxy : sept jours au plus

Une sortie apparaît dans une URL `/sortie/<identifiant>`. Des journaux nginx conservés des mois
sont un historique de consultation des sorties — exactement ce que la page données exclut.
La rotation est à configurer en même temps que le proxy, pas plus tard.

---

## 4. Ce qui n'a jamais été éprouvé en vrai

À vérifier dans cet ordre, le premier jour en ligne :

1. **Une notification push qui arrive vraiment sur un téléphone.** Zéro abonnement enregistré à
   ce jour : ce chemin n'a jamais été parcouru en conditions réelles. Il exige HTTPS, et sur
   iPhone l'application ajoutée à l'écran d'accueil.
2. **Un lien de connexion reçu, hors indésirables**, sur Gmail et sur Outlook.
3. **Une clé d'accès enregistrée depuis un vrai Android**, puis une reconnexion le lendemain
   depuis un navigateur fermé entre-temps.
4. **L'ajout à l'écran d'accueil sur iPhone**, avec quelqu'un qui ne l'a jamais fait — c'est le
   geste le plus susceptible de perdre un parent, et il conditionne les notifications.
5. **Une charge réelle.** L'estimation « dix mille connexions quotidiennes tiennent » est une
   estimation, pas une mesure. Un test avec quelques centaines de sessions simultanées la
   remplacerait par un chiffre.

---

## 5. Ce qui cédera à l'échelle

Connu, mesurable, non corrigé — à traiter quand les cercles dépasseront la cinquantaine de
familles, pas avant :

- **L'envoi des notifications est séquentiel.** `notifyPublication`
  ([notifications.ts](src/lib/notifications.ts)) boucle sur les destinataires et attend chaque
  appel HTTP. Trois cents familles ≈ trente secondes pendant lesquelles l'action de publication
  reste ouverte. C'est structurel, et environ trente lignes à changer : envoi par lots
  concurrents, ou sortie de l'action vers une tâche.
- **Un N+1 sur l'écran principal** : la liste des participants visibles est recalculée une fois
  par sortie affichée.
- **L'ingestion est séquentielle**, source par source puis fiche par fiche. Sans importance à
  trois sources ; à revoir à vingt.

---

## 6. Fonctionnalités — ce qui manque avant de vrais parents

Le périmètre du pilote est complet. Ce qui suit n'est pas de l'enrichissement, c'est ce qui
manque pour qu'un cercle réel fonctionne sans moi derrière.

**Ce qui bloque l'adoption :**

- **Le catalogue de lieux démarre vide.** Un cercle qui se crée à Onex ne trouve aucun parc à
  proposer, et le premier parent doit tout saisir. Amorcer le catalogue par commune — parcs,
  places de jeux, piscines, bibliothèques — est un travail de données, pas de code, et il
  conditionne le premier geste de l'application.
- **Le problème du premier arrivant.** Un cercle neuf est un écran vide qui ne dit rien de ce
  qu'on peut y faire. Il faut que cet écran explique et propose, sinon le cercle meurt avant sa
  troisième famille.
- **La récupération quand la boîte aux lettres change.** Aujourd'hui, une adresse
  électronique perdue est un compte perdu. Un second parent lié couvre une partie des cas ;
  ce n'est pas une réponse complète.

**Ce que les parents demanderont, et qui demande une décision plutôt que du code :**

- **« Qui veut venir ? »** — c'est une messagerie déguisée, et c'est la demande la plus
  probable. À anticiper : soit un signal fermé sans texte libre (« je propose », « je viens »),
  soit un refus assumé. Ne pas laisser un champ de texte devenir un fil de discussion par
  accident : [PRODUIT.md](PRODUIT.md) prévient déjà que c'est ainsi que ça arrive.
- **Les photos** — non. Une photo d'enfant dans une application qui ne stocke qu'un prénom
  ferait s'effondrer tout l'édifice de minimisation.
- **Les sorties répétées** (« tous les mercredis au parc ») — utile, sans risque, à faire quand
  la demande se manifeste.

**Volontairement reportés, à ne pas oublier :** tests de bout en bout, et un écran de lecture
du journal d'audit — aujourd'hui il se lit en SQL, ce qui suffit tant que je suis le seul à
l'exploiter.

---

## 7. L'IA qui lit les agendas du canton

### Où on en est

Trois sources ([seed-sources.mts](scripts/seed-sources.mts)), deux chemins :

- **Ville de Genève** — chaque fiche expose du schema.org `Event` en JSON-LD. Lecture
  structurée, rien n'est interprété, **publication automatique**.
- **Lancy, Onex** — aucun flux structuré (ni JSON-LD, ni iCal, ni RSS ; vérifié). La page est
  réduite à son texte et lue par MiniMax M3, qui en extrait des événements. **Rien n'est publié
  sans relecture humaine.**

Trois garde-fous encadrent déjà la lecture par le modèle
([minimax.ts](src/lib/ingest/minimax.ts)) : consigne explicite de ne jamais inventer de date et
d'omettre tout événement dont l'année n'est pas écrite ; validation de la réponse par un schéma
strict ; rejet de toute date hors d'une fenêtre plausible (hier au plus tôt, un an au plus
tard). Et la relecture permet de **corriger** avant publication, pas seulement d'accepter ou de
jeter — parce que l'erreur la plus fréquente du modèle est l'horaire, et qu'une bonne activité
mal datée ne mérite pas la poubelle.

### La règle qui ne bougera pas

**Le modèle ne voit que des pages web publiques. Jamais une donnée de parent, jamais une
inscription, jamais un prénom d'enfant.** C'est écrit dans [DONNEES.md](DONNEES.md) et c'est ce
qui permet d'y écrire que les données ne quittent pas la Suisse.

Cela a une conséquence directe sur ce que « croiser les données » peut vouloir dire :
le croisement va **du public vers le catalogue**, jamais l'inverse. On peut relier une activité
communale à un lieu du catalogue ; on ne peut pas envoyer à un modèle « voici où vont les
familles de la classe 4P, propose-leur quelque chose ». Cette seconde chose serait le
meilleur produit et la fin du seul argument qu'Allezou possède.

### Ce qui manque, dans l'ordre où ça vaut la peine

**1. Croiser les sources entre elles.** Aujourd'hui l'identité d'un événement est
`(source, identifiant chez la source)` : la même fête de quartier publiée par la Ville et par
la commune apparaît **deux fois** dans l'agenda. Il faut une empreinte transversale — titre
normalisé + jour de début + commune — et une règle d'arbitrage : en cas de doublon, la version
issue d'un flux structuré l'emporte sur la version lue par le modèle, et le lien vers la source
la plus complète est conservé. C'est le premier défaut que verra un parent, parce qu'il est
visible sans rien connaître du système.

**2. Relier une activité à un lieu du catalogue.** `placeLabel` est aujourd'hui du texte libre
recopié de la source. Le relier au catalogue de lieux ouvre les deux fonctions qui donnent sa
valeur à l'agenda : « cette activité a lieu au parc où vous allez déjà » et, en un geste,
transformer une activité de l'agenda en sortie de famille. C'est un rapprochement de chaînes
mal écrites des deux côtés : à faire par proposition, avec confirmation humaine à la relecture,
jamais automatiquement.

**3. Suivre la pagination des agendas communaux.** Le chemin `html_ai` ne lit **qu'une seule
page** — une seule requête, un seul appel au modèle. Là où le chemin JSON-LD parcourt la liste
puis suit chaque fiche, la lecture communale s'arrête au premier écran. C'est probablement la
raison principale pour laquelle ces sources rapportent peu.

**4. Mesurer la qualité, pour pouvoir en parler.** Rien n'enregistre aujourd'hui ce que le
relecteur a fait : accepté tel quel, corrigé, rejeté. Trois colonnes de plus et l'on peut dire
« sur cette source, le modèle est juste neuf fois sur dix, et se trompe surtout sur les
horaires » — au lieu de l'impression que j'en ai. C'est aussi la condition du point suivant.

**5. Un palier de confiance par source.** Le budget réel de l'agenda n'est pas le coût des
appels au modèle : c'est le **quart d'heure de relecture hebdomadaire**. Ajouter vingt communes
multiplie ce quart d'heure par dix, et c'est ce qui plafonne la couverture cantonale — pas la
technique. La sortie est un palier : une source dont les cinquante derniers événements ont été
acceptés sans correction passe en publication automatique, avec retour en relecture au premier
rejet. À n'activer qu'une fois le point 4 en place : sans mesure, ce palier n'est qu'un pari.

**6. Détecter la dérive, pas seulement la panne.** Une source est signalée « muette » après
sept jours sans contenu ([run.ts](src/lib/ingest/run.ts)). Mais une source qui rapportait trente
activités et n'en rapporte plus que trois est en panne aussi — refonte du site, sélecteur
changé, page découpée — et rien ne la signale. Une baisse relative par rapport à la moyenne des
passages précédents suffirait.

**7. L'adaptateur iCal.** Prévu dans le contrat des adaptateurs, jamais écrit : aucune source
genevoise vérifiée n'en expose. À écrire le jour où l'une le fait — c'est le chemin le plus sûr
des trois, puisqu'il n'interprète rien.

**8. Le pied juridique du moissonnage.** À mettre en ordre avant d'élargir à vingt communes,
pas après : respecter `robots.txt`, garder un `User-Agent` identifiant avec une adresse de
contact (aujourd'hui `Allezou/0.1 (agenda familial genevois)`, sans contact), espacer les
requêtes, afficher systématiquement la source et un lien vers elle — ce qui est déjà le cas —
et retirer sans discuter une commune qui le demande. Écrire à deux ou trois communes pour
annoncer ce qu'on fait coûte un courriel et transforme un moissonnage subi en partenariat.

**9. Ne pas dépendre d'un seul fournisseur.** MiniMax est le seul chemin non structuré. Le
contrat `Adapter` ([types.ts](src/lib/ingest/types.ts)) est déjà la couture qu'il faut : un
second fournisseur est un fichier, pas une refonte. Et une panne du modèle ne vide pas
l'agenda — les événements déjà publiés restent publiés, seule la file de relecture se tarit.

---

## 8. L'ordre dans lequel faire tout ça

**Avant la première invitation à de vrais parents :**

1. Renseigner `allezou.ch` dans `APP_URL` — le domaine est pris et pointé — puis le soumettre à
   hstspreload.org une fois le service en ligne. Ne plus en changer ensuite : chaque bascule
   coûte une réinscription à tout le monde.
2. `SCHEDULER=1`, et vérifier le lendemain que les tâches ont tourné (écran de relecture).
3. SMTP + SPF/DKIM/DMARC, testés vers Gmail et Outlook.
4. Rotation des journaux du proxy à sept jours.
5. Créer et relever la boîte `contact@allezou.ch`, déjà annoncée dans
   [DONNEES.md](DONNEES.md), et la phrase sur la boîte aux lettres comme clé du compte.
6. Vérifier qu'une notification arrive vraiment sur un téléphone.

**Dans les premières semaines :**

7. **Pousser les sauvegardes hors de la machine**, vers S3 Swiss Backup. Reporté sciemment le
   14 août 2026 : tant que le pilote tourne, ce qu'une panne de disque emporterait se recrée en
   une soirée. Ça cesse d'être vrai dès le premier groupe de parents — c'est le moment convenu
   pour le faire, et il arrive avant que la perte ne devienne coûteuse, pas après.
8. Amorcer le catalogue de lieux par commune.
9. Relever le plafond d'envoi de liens avant toute invitation de masse.
10. Export « mes données » en un geste ; liste et fermeture des sessions ouvertes.
11. Dédoublonnage entre sources, et pagination des agendas communaux.

**Quand la première classe fonctionne sans moi :**

11. Mesure de la qualité de lecture, puis palier de confiance par source.
12. Envoi des notifications par lots.
13. Élargissement des communes — jamais avant que le budget de relecture le permette.
