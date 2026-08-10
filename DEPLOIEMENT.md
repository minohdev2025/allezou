# Déploiement de Totir

> **Pour une démonstration**, rien de tout ceci n'est nécessaire : voir
> [« Montrer l'app sans la déployer »](#montrer-lapp-sans-la-déployer) à la fin.

---


Cible : une **instance dédiée sur Infomaniak Public Cloud** (Suisse), provisionnée comme les
autres — Terraform / OpenStack, le même projet que la flotte LiNX. Séparée du VPS éditeur :
Totir bougera souvent, et il n'a rien à faire sur la machine qui sert des cabinets qui paient.

Domaine : **r4c.app**. En `.app`, donc sur la liste de préchargement HSTS — les navigateurs
refusent le HTTP sur ce domaine, aucune bascule n'est possible.

Devant, un proxy inverse : **nginx** ou **Caddy**, au choix — l'instance est neuve, rien
n'impose l'un ou l'autre. Dans l'écosystème LiNX, nginx sert sur les VPS de cabinet et Caddy
sur le VPS éditeur. Les deux configurations sont données plus bas.

L'application écoute sur `127.0.0.1:4100` et n'est jamais exposée directement ; Postgres ne
publie aucun port.

## 0. L'instance

Une petite instance suffit : un pilote de quelques classes, c'est une poignée de requêtes par
jour. Deux vCPU et 4 Go de mémoire laissent de la marge pour construire l'image sur place.

Le pare-feu n'ouvre que **22** et **443**. Ni 80 — le domaine est en `.app`, préchargé HSTS,
personne n'y arrivera en clair — ni 5432 : Postgres ne sort pas de la machine.

À installer : Docker avec le module Compose, et Caddy.

## 1. Variables

Copier `.env.example` en `.env` **sur le serveur**, à côté de `docker-compose.prod.yml`, et
renseigner :

| Variable | Comment l'obtenir |
|---|---|
| `POSTGRES_PASSWORD` | `openssl rand -base64 32` — différent de celui de LiNX |
| `SESSION_SECRET` | `openssl rand -base64 32` — **jamais** celui du développement |
| `APP_URL` | `https://r4c.app` |
| `SMTP_*` | Compte d'envoi Infomaniak. Sans lui, personne ne se connecte |
| `VAPID_*` | `npx web-push generate-vapid-keys` |
| `ADMIN_EMAILS` | Les adresses qui accèdent à `/relecture` |
| `MINIMAX_API_KEY` | Lecture des agendas communaux sans flux structuré |

Le démarrage échoue si l'un des obligatoires manque : mieux vaut un service qui refuse de
démarrer qu'un service qui tourne avec un secret par défaut.

## 2. Lancer

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec app npx drizzle-kit migrate
docker compose -f docker-compose.prod.yml exec app npm run sources:seed
```

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
    server_name r4c.app;

    ssl_certificate     /etc/letsencrypt/live/r4c.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/r4c.app/privkey.pem;

    access_log /var/log/nginx/r4c.access.log;

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

Le port 80 n'est pas ouvert : le domaine est en `.app`, préchargé HSTS, personne n'y arrivera
en clair. Certbot doit donc utiliser le défi DNS (`--preferred-challenges dns`) plutôt que le
défi HTTP.

### Caddy

Le certificat et son renouvellement sont automatiques, et le défi DNS n'est pas nécessaire.

```caddyfile
r4c.app {
    reverse_proxy 127.0.0.1:4100

    log {
        output file /var/log/caddy/r4c.log {
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
les copies restent en Suisse, comme la base. Autant y ajouter Totir plutôt que d'inventer un
second chemin.

## 5. Ce qui reste à vérifier une fois en ligne

- Une notification push qui **arrive vraiment** sur un téléphone. Jamais testé jusqu'ici :
  il faut HTTPS, et sur iPhone l'application ajoutée à l'écran d'accueil.
- Un lien de connexion qui arrive par courriel, et pas dans les indésirables.
- L'adresse de contact de DONNEES.md — aujourd'hui une adresse postale seulement. Un parent
  qui veut corriger une donnée doit écrire une lettre.

---

## Montrer l'app sans la déployer

Pour une présentation que tu mènes toi-même, depuis ton écran : personne ne crée de compte,
aucune donnée réelle n'existe, et il n'y a rien à héberger. Il faut juste du HTTPS — sans lui,
ni les notifications ni l'installation sur l'écran d'accueil ne fonctionnent, et ce sont
justement les deux choses qu'on veut montrer.

Un tunnel Cloudflare depuis ta machine suffit. Il est **séparé** de celui de `linq-a.ch` :
voir [cloudflared/totir.yml](cloudflared/totir.yml) pour les trois commandes d'installation,
à faire une seule fois.

**Avant la première démonstration**, dans `.env.local` :

```
APP_URL=https://r4c.app
```

Sans quoi les liens d'invitation, les liens de connexion et les codes QR pointeraient encore
vers `localhost` — et ne marcheraient sur aucun téléphone.

**Le jour même**, deux terminaux :

```bash
npm run demo:start
```

```bash
npm run demo:tunnel
```

`demo:start` construit et lance en mode production : les cookies passent en `secure`, la
politique de sécurité perd son `unsafe-eval` de développement, et ce que tu montres ressemble
à ce qui tournera vraiment.

Deux choses à savoir avant de te lancer :

- **Sans SMTP, le lien de connexion s'affiche à l'écran** dans un encadré « Développement :
  aucun SMTP configuré ». Pratique pour toi, mais visible par-dessus ton épaule. Quatre
  lignes `SMTP_*` d'un compte Infomaniak suffisent à le faire disparaître.
- **Sur iPhone, les notifications n'arrivent que depuis l'app installée.** Ajoute-la à
  l'écran d'accueil avant la démonstration, pas devant les parents.
