#!/usr/bin/env bash
# Construit l'image ici, l'envoie sur le VPS, et remet le service en route.
#
# La construction n'a pas lieu sur le serveur : 2 Go de mémoire ne suffisent pas à
# `next build` (DEPLOIEMENT.md §0). Variables réglables : SERVEUR, RACINE.
set -euo pipefail

SERVEUR="${SERVEUR:-ubuntu@allezou.ch}"
RACINE="${RACINE:-/home/ubuntu/allezou}"
IMAGE="totir:latest"
COMPOSE="docker compose -f docker-compose.prod.yml"

echo "→ construction de $IMAGE (linux/amd64)"
docker build --platform linux/amd64 -t "$IMAGE" .

echo "→ transfert vers $SERVEUR"
docker save "$IMAGE" | gzip | ssh "$SERVEUR" 'gunzip | docker load'

echo "→ démarrage et migrations"
ssh "$SERVEUR" "cd '$RACINE' && $COMPOSE up -d && $COMPOSE exec -T app npx drizzle-kit migrate && docker image prune -f"

echo "✓ en ligne — https://allezou.ch"
