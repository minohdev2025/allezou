#!/usr/bin/env bash
# Construit l'image ici, l'envoie sur le VPS, et remet le service en route.
#
# La construction n'a pas lieu sur le serveur : 2 Go de mémoire ne suffisent pas à
# `next build` (DEPLOIEMENT.md §0). Variables réglables : SERVEUR, RACINE.
#
# L'image porte deux étiquettes : `totir:latest`, que `docker-compose.prod.yml`
# attend, et `totir:<commit>-<horodatage>`, qui distingue deux builds entre eux.
# `latest` ne sait pas le faire : sans la seconde étiquette, un `docker save | ssh
# | docker load` qui échoue en plein milieu laisse deux builds sous le même nom,
# et l'on ne sait plus ce qui tourne sur le serveur. L'étiquette de version est
# aussi ce qui sert à `totir:previous`, l'avant-dernier déploiement qu'on garde
# comme filet de sécurité.
set -euo pipefail

SERVEUR="${SERVEUR:-ubuntu@allezou.ch}"
RACINE="${RACINE:-/home/ubuntu/allezou}"
IMAGE="totir:latest"
VERSION="totir:$(git rev-parse --short=7 HEAD)-$(date -u +%Y%m%dT%H%M%SZ)"
COMPOSE="docker compose -f docker-compose.prod.yml"

echo "→ construction de $IMAGE ($VERSION, linux/amd64)"
docker build --platform linux/amd64 -t "$IMAGE" -t "$VERSION" .

echo "→ transfert vers $SERVEUR"
# Le fichier compose vit en double : ici et sur le serveur. Le transférer à chaque fois évite
# qu'une limite ou une variable ajoutée dans le dépôt n'arrive jamais à destination. Le `.env`
# du serveur, lui, n'est pas touché : c'est là que vivent les secrets.
scp -q docker-compose.prod.yml "$SERVEUR:$RACINE/docker-compose.prod.yml"
docker save "$IMAGE" | gzip | ssh "$SERVEUR" 'gunzip | docker load'

# L'image qui tournait jusqu'ici devient `totir:previous` avant d'être écrasée par
# la nouvelle sous `totir:latest`. Un déploiement raté se défait en relançant le
# compose sur `totir:previous`. `2>/dev/null || true` : au premier déploiement,
# rien n'existe encore, et il ne faut pas que la commande échoue.
ssh "$SERVEUR" 'docker tag totir:latest totir:previous 2>/dev/null || true'

echo "→ démarrage et migrations"
ssh "$SERVEUR" "cd '$RACINE' && $COMPOSE up -d && $COMPOSE exec -T app node scripts/migrer.mjs"

# Le nettoyage ne touche qu'aux images sans étiquette (`<none>`) : ce sont les
# couches intermédiaires des builds précédents, et elles ne servent plus à rien.
# `totir:latest`, `totir:previous` et `totir:<commit>-<horodatage>` restent, ce qui
# laisse le choix entre trois images connues. Les étiquettes de version plus
# anciennes (les `totir:<commit>-<ts>` des déploiements d'avant-hier) sont
# balayées ici : sans cela, elles s'accumulent et le disque dérive.
echo "→ nettoyage des vieilles étiquettes"
ssh "$SERVEUR" "
  set -e
  docker image prune -f
  docker images --format '{{.Repository}}:{{.Tag}}' totir \\
    | grep '^totir:[0-9a-f]' \\
    | grep -v '${VERSION#totir:}' \\
    | xargs -r docker rmi
"

echo "✓ en ligne — https://allezou.ch ($VERSION)"
