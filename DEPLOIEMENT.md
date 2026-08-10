# Déploiement de Totir

Cible : le même serveur que le hub LiNX, chez Infomaniak en Suisse, derrière nginx.
Domaine : **r4c.app** — en `.app`, donc sur la liste de préchargement HSTS : les navigateurs
refusent le HTTP sur ce domaine, aucune bascule n'est possible.

L'application écoute sur `127.0.0.1:4100` et n'est jamais exposée directement ; Postgres ne
publie aucun port. Réseau, volume et mot de passe sont distincts de ceux de LiNX.

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

## 3. nginx

```nginx
server {
    listen 443 ssl http2;
    server_name r4c.app;

    ssl_certificate     /etc/letsencrypt/live/r4c.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/r4c.app/privkey.pem;

    # Les en-têtes de sécurité viennent de l'application (src/proxy.ts et next.config.ts).
    # Ne pas les redéfinir ici : deux valeurs pour un même en-tête, et les navigateurs
    # retiennent la plus restrictive ou aucune, selon l'en-tête.

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

server {
    listen 80;
    server_name r4c.app;
    return 301 https://$host$request_uri;
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

## 5. Ce qui reste à vérifier une fois en ligne

- Une notification push qui **arrive vraiment** sur un téléphone. Jamais testé jusqu'ici :
  il faut HTTPS, et sur iPhone l'application ajoutée à l'écran d'accueil.
- Un lien de connexion qui arrive par courriel, et pas dans les indésirables.
- L'adresse de contact de DONNEES.md — aujourd'hui une adresse postale seulement. Un parent
  qui veut corriger une donnée doit écrire une lettre.
