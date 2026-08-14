# Déploiement d'Allezou

> **Pour une démonstration**, rien de tout ceci n'est nécessaire : voir
> [« Montrer l'app sans la déployer »](#montrer-lapp-sans-la-déployer) à la fin.
>
> Ce document dit **comment** installer l'application sur une machine.
> [PRODUCTION.md](PRODUCTION.md) dit **ce qui doit être vrai avant que de vrais parents s'en
> servent** — à lire en premier.

---


Cible : un **VPS Infomaniak** (Suisse), séparé du VPS éditeur — Allezou bougera souvent, et il
n'a rien à faire sur la machine qui sert des cabinets qui paient.

Domaine : **allezou.ch**, déjà pointé sur le VPS. Contrairement à un `.app`, le TLD n'est pas
préchargé HSTS en bloc : le domaine est à soumettre une fois à
[hstspreload.org](https://hstspreload.org), l'en-tête étant déjà conforme. Voir
[PRODUCTION.md §1](PRODUCTION.md). C'est la seule adresse de l'application — il n'y en a plus
d'autre à tenir à jour. `www.allezou.ch` pointe sur la même machine et n'y fait qu'une
redirection permanente.

> **Modifier un enregistrement chez Infomaniak ne suffit pas toujours à le publier.** L'apex et
> `www` ont été changés à la même seconde ; seul l'apex est parti. Pendant une heure, la zone
> affichait la bonne valeur pour `www` et les serveurs de noms en servaient une autre — le
> numéro de série de la zone, lui, n'avait pas bougé. Supprimer l'enregistrement puis le
> recréer a forcé la republication. En cas de doute, c'est le numéro de série qui tranche, pas
> ce qu'affiche l'interface : `nslookup -type=SOA allezou.ch ns11.infomaniak.ch`.

Devant, un proxy inverse : **nginx** ou **Caddy**, au choix — l'instance est neuve, rien
n'impose l'un ou l'autre. Dans l'écosystème LiNX, nginx sert sur les VPS de cabinet et Caddy
sur le VPS éditeur. Les deux configurations sont données plus bas.

L'application écoute sur `127.0.0.1:4100` et n'est jamais exposée directement ; Postgres ne
publie aucun port.

## 0. L'instance

**Commandée : 1 vCPU, 2 Go de mémoire, 20 Go de disque.** Pour *servir*, c'est confortable :
un pilote de quelques classes, c'est une poignée de requêtes par jour, et Next.js en production
à côté de Postgres tient sans peine dans 2 Go.

**Pour *construire*, non.** `next build` réclame couramment plus d'un gigaoctet à lui seul ;
avec Postgres à côté sur une machine de 2 Go, la marge est nulle et le noyau finit par tuer le
processus — au plus mauvais moment, celui d'une mise à jour, quand le service est déjà arrêté.
L'image se construit donc ailleurs et voyage jusqu'au serveur (§2). Le `build:` de
[docker-compose.prod.yml](docker-compose.prod.yml) reste bon sur une machine de développement ;
sur le serveur, **`up -d` sans `--build`**.

Les 20 Go demandent la même discipline : chaque version livrée laisse ses couches Docker
derrière elle. Un `docker image prune -f` après chaque déploiement, et le disque ne dérive pas.

Elle tourne sous **Ubuntu**, et l'accès se fait par clé, sous l'utilisateur `ubuntu` :

```bash
ssh -i <chemin-de-la-clé> ubuntu@allezou.ch
```

Le nom pointant déjà sur la machine, il n'y a pas d'adresse IP à retenir — la console
Infomaniak la donne, si le DNS n'est pas encore propagé chez toi.

Le pare-feu n'ouvre que **22** et **443**. Ni 5432 : Postgres ne sort pas de la machine. Ni 80,
et c'est un choix : un port 80 fermé ne peut rien laisser passer en clair, là où un port 80 qui
redirige offre une première requête à intercepter. Les navigateurs actuels essaient HTTPS
d'eux-mêmes pour une adresse tapée à la main, et les invitations circulent en `https://` — mais
un lien écrit `http://allezou.ch` par quelqu'un échouera franchement. C'est le compromis retenu,
et [hstspreload.org](https://hstspreload.org) n'exige de redirection que si le port 80 écoute.

À installer : Docker avec le module Compose, et Caddy. Tout vient des dépôts Ubuntu — ni script
distant tubé dans un shell, ni dépôt tiers à faire confiance :

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 caddy
sudo usermod -aG docker ubuntu          # se reconnecter pour que le groupe prenne
sudo ufw allow 22/tcp && sudo ufw allow 443/tcp && sudo ufw --force enable
```

Ouvrir 22 **avant** d'activer le pare-feu, sinon la session en cours est la dernière.

**Et il y a un second pare-feu.** ufw ne filtre que sur la machine ; le VPS Infomaniak en a un
autre en amont, dans le manager — *VPS → allezou → Firewall* — qui ne laisse passer que 22 à la
livraison. Un port fermé là se manifeste par un **délai d'attente**, jamais par un refus : c'est
ce qui a fait échouer les premiers défis ACME alors que `ss` montrait Caddy à l'écoute et que
`ufw status` autorisait le 443. Ajouter une règle **TCP 443, toutes les IP**, en choisissant
« Sélection manuelle » — un préréglage applicatif ouvrirait le 80 avec.

Le VPS n'écoute que sur **22** : ni 80 ni 443 ne répondent tant que Caddy n'est pas installé,
et c'est l'état voulu. Si un jour Caddy n'obtient pas son certificat, la première question est
celle-là — `sudo ss -lntp | grep -E ':(80|443)'` dit qui occupe les ports, et deux services sur
443 suffisent à faire échouer le défi TLS-ALPN.

## 1. Variables

Copier `.env.example` en `.env` **sur le serveur**, à côté de `docker-compose.prod.yml`, et
renseigner :

| Variable | Comment l'obtenir |
|---|---|
| `POSTGRES_PASSWORD` | `openssl rand -hex 32` — **pas** de base64 : ce mot de passe entre dans `DATABASE_URL`, et un `/` ou un `+` y coupe l'URL en deux ([docker-compose.prod.yml](docker-compose.prod.yml)). Différent de celui de LiNX |
| `SESSION_SECRET` | `openssl rand -base64 32` — **jamais** celui du développement |
| `APP_URL` | `https://allezou.ch` — en changer plus tard invalide les clés d'accès et les abonnements push ([PRODUCTION.md §1](PRODUCTION.md)) |
| `SMTP_*` | Compte d'envoi Infomaniak. Sans lui, personne ne se connecte |
| `VAPID_*` | `npx web-push generate-vapid-keys` |
| `ADMIN_EMAILS` | Les adresses qui accèdent à `/relecture` |
| `MINIMAX_API_KEY` | Lecture des agendas communaux sans flux structuré |

Le démarrage échoue si l'un des obligatoires manque : mieux vaut un service qui refuse de
démarrer qu'un service qui tourne avec un secret par défaut.

## 2. Lancer

Une commande, depuis le dépôt, sur ta machine :

```bash
./scripts/deploy.sh
```

Elle construit l'image, l'envoie par `ssh`, redémarre le service et applique les migrations.
Un registre ferait le même travail que le `docker save | ssh`, mais tant qu'il n'y a qu'un
serveur, `ssh` suffit et n'ajoute aucun compte à gérer. `SERVEUR` et `RACINE` se surchargent
par variable d'environnement.

Ce qu'elle fait, si tu préfères le faire à la main :

```bash
docker build --platform linux/amd64 -t totir:latest .
docker save totir:latest | gzip | ssh ubuntu@allezou.ch 'gunzip | docker load'
```

L'image, les conteneurs et la base gardent le nom `totir` : ce sont des identifiants internes,
que personne ne lit, et les renommer coûterait une migration de base pour rien.

Puis sur le serveur, `up -d` **sans** `--build` — l'image est déjà là :

```bash
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec app npx drizzle-kit migrate
docker compose -f docker-compose.prod.yml exec app npm run sources:seed
docker image prune -f
```

Le premier déploiement demande d'abord de déposer `docker-compose.prod.yml` et le `.env`
rempli dans `RACINE` sur le serveur — c'est le seul passage qui ne se rejoue pas.

## 3. Le proxy inverse

Dans les deux cas, **ne pas redéfinir les en-têtes de sécurité** : ils viennent de
l'application (`src/proxy.ts` et `next.config.ts`). Deux valeurs pour un même en-tête, et
selon lequel, le navigateur retient la plus restrictive — ou aucune.

Et dans les deux cas, **garder les journaux d'accès sept jours au plus**. Une sortie apparaît
dans une URL de type `/sortie/<identifiant>` : des journaux conservés des mois reviendraient
à garder une trace des sorties consultées, ce que la page d'information exclut.

### nginx

Le certificat vient de certbot, à installer et à renouveler.

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name allezou.ch;

    ssl_certificate     /etc/letsencrypt/live/allezou.ch/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/allezou.ch/privkey.pem;

    access_log /var/log/nginx/allezou.access.log;

    location / {
        proxy_pass http://127.0.0.1:4100;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
    }
}
```

Avec, dans `/etc/logrotate.d/nginx`, une rotation qui ne garde pas plus de sept jours.

Le port 80 n'est pas ouvert. Certbot doit donc utiliser le défi DNS
(`--preferred-challenges dns`) plutôt que le défi HTTP.

### Caddy

C'est le choix retenu, et la configuration est au dépôt : [caddy/Caddyfile](caddy/Caddyfile),
à déposer en `/etc/caddy/Caddyfile`. Le certificat et son renouvellement sont automatiques, et
le défi DNS n'est pas nécessaire : le port 80 étant fermé, Caddy obtient son certificat par le
défi TLS-ALPN sur 443.

```caddyfile
allezou.ch {
    reverse_proxy 127.0.0.1:4100

    log {
        output file /var/log/caddy/allezou.log {
            roll_size 20MiB
            roll_keep_for 168h
        }
    }
}
```

## 4. Sauvegardes — le point qui demande une décision

Une sauvegarde nocturne conservée trente jours **contredit ce que [DONNEES.md](DONNEES.md)
promet aux parents** : « une présence expirée disparaît, y compris des journaux techniques et
des sauvegardes ». Restaurer une sauvegarde de la semaine dernière ferait réapparaître les
sorties de la semaine dernière.

Trois façons de tenir la promesse, à trancher avant les premiers vrais parents :

1. **Exclure les tables éphémères de la sauvegarde.** `pg_dump --exclude-table=publication
   --exclude-table=publication_circle --exclude-table=publication_participant
   --exclude-table=publication_participant_child --exclude-table=publication_hidden_from`.
   Ce qui compte vraiment — comptes, enfants, cercles, appartenances, lieux — est sauvegardé ;
   les sorties, non. Elles ne valent que quelques heures de toute façon.
2. **Rétention de sauvegarde courte**, deux jours au plus, pour toute la base.
3. **Réécrire la phrase** de DONNEES.md. À n'envisager qu'en dernier recours : c'est la page
   que lira l'association de parents.

La première est la plus honnête : elle protège ce qui a de la valeur sans conserver
d'historique de déplacement.

Pour la destination, l'écosystème LiNX sauvegarde déjà sur **S3 Swiss Backup d'Infomaniak** :
les copies restent en Suisse, comme la base. Autant y ajouter Allezou plutôt que d'inventer un
second chemin.

## 5. Ce qui reste à vérifier une fois en ligne

- Une notification push qui **arrive vraiment** sur un téléphone. Jamais testé jusqu'ici :
  il faut HTTPS, et sur iPhone l'application ajoutée à l'écran d'accueil.
- Un lien de connexion qui arrive par courriel, et pas dans les indésirables.
- `contact@allezou.ch` : la boîte existe chez Infomaniak, reçoit, et quelqu'un la relève.
  [DONNEES.md](DONNEES.md) l'annonce aux parents, l'écran « Vous » y renvoie, et c'est elle qui
  envoie les liens de connexion (`SMTP_FROM`).

---

## Montrer l'app sans la déployer

Pour une présentation que tu mènes toi-même, depuis ton écran : personne ne crée de compte,
aucune donnée réelle n'existe, et il n'y a rien à héberger. Il faut juste du HTTPS — sans lui,
ni les notifications ni l'installation sur l'écran d'accueil ne fonctionnent, et ce sont
justement les deux choses qu'on veut montrer.

Depuis qu'`allezou.ch` pointe sur le VPS, le plus court est souvent de déployer et de montrer le
vrai site. Ce qui suit sert quand le serveur n'est pas prêt, ou pour montrer une version qui n'y
est pas encore.

`npm run demo:tunnel` ouvre un tunnel éphémère en `*.trycloudflare.com` vers ta machine. Deux
terminaux :

```bash
npm run demo:tunnel
```

```bash
npm run demo:start
```

L'adresse du tunnel change à chaque lancement : il faut la reporter dans l'`APP_URL` de
`.env.local` **avant** de démarrer l'application, sinon les liens et les codes QR pointent
ailleurs. Et une application ajoutée à un écran d'accueil depuis cette adresse ne survit pas au
lancement suivant — la stabilité du nom, c'est `allezou.ch` qui la porte maintenant, sur le
serveur.

`demo:start` construit et sert en mode production : les cookies passent en `secure`, la
politique de sécurité perd son `unsafe-eval`, et ce que tu montres ressemble à ce qui tournera
vraiment.

> **Ne jamais lancer `cloudflared tunnel --url` seul.** Sans `--config`, cloudflared lit
> `~/.cloudflared/config.yml`, celui de `linq-a.ch` : sa règle finale
> `- service: http_status:404` attrape l'adresse `trycloudflare.com` et l'application répond
> 404 sur toutes ses pages, sans qu'aucune erreur ne le signale.
> [cloudflared/rapide.yml](cloudflared/rapide.yml) est vide exprès pour neutraliser cet
> héritage, et `npm run demo:tunnel` le passe en `--config`.

Deux choses à savoir avant de te lancer :

- **Sans SMTP, le lien de connexion s'affiche à l'écran** dans un encadré « Développement :
  aucun SMTP configuré ». Pratique pour toi, mais visible par-dessus ton épaule. Quatre
  lignes `SMTP_*` d'un compte Infomaniak suffisent à le faire disparaître.
- **Sur iPhone, les notifications n'arrivent que depuis l'app installée.** Ajoute-la à
  l'écran d'accueil avant la démonstration, pas devant les parents.
