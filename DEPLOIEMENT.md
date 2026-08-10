# Déploiement de Totir

Cible : une **instance dédiée sur Infomaniak Public Cloud** (Suisse), provisionnée comme les
autres — Terraform / OpenStack, le même projet que la flotte LiNX. Séparée du VPS éditeur :
Totir bougera souvent, et il n'a rien à faire sur la machine qui sert des cabinets qui paient.

Domaine : **r4c.app**. En `.app`, donc sur la liste de préchargement HSTS — les navigateurs
refusent le HTTP sur ce domaine, aucune bascule n'est possible.

Devant, **Caddy**, comme sur le VPS éditeur : il obtient et renouvelle le certificat tout
seul, il n'y a pas de certbot à entretenir.

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

## 3. Caddy

Dans le `Caddyfile` de l'hôte. Le certificat et son renouvellement sont automatiques.

```caddyfile
r4c.app {
    reverse_proxy 127.0.0.1:4100

    # Les en-têtes de sécurité viennent de l'application (src/proxy.ts et next.config.ts).
    # Ne rien redéfinir ici : deux valeurs pour un même en-tête, et selon lequel, le
    # navigateur retient la plus restrictive — ou aucune.

    log {
        # Les journaux d'accès contiennent des adresses IP et des chemins. Une sortie
        # apparaît dans une URL de type /sortie/<identifiant> : garder ces journaux
        # longtemps reviendrait à garder une trace des sorties consultées, ce que la page
        # d'information exclut. Sept jours suffisent à diagnostiquer une panne.
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
