#!/usr/bin/env bash
# Sauvegarde de la base, sans les sorties.
#
# [DONNEES.md](../DONNEES.md) promet qu'une présence expirée disparaît « y compris des
# journaux techniques et des sauvegardes ». Une sauvegarde nocturne gardée trente jours
# contredirait cette phrase : restaurer celle de la semaine dernière ferait réapparaître les
# sorties de la semaine dernière, et donc l'historique de déplacement que PRODUIT.md interdit.
#
# On sauvegarde donc ce qui a de la valeur et vieillit bien — comptes, enfants, cercles,
# appartenances, lieux, sources d'agenda — et rien des publications, qui ne valent que
# quelques heures de toute façon.
#
# `--exclude-table-data` plutôt que `--exclude-table`, contrairement à ce que suggérait
# PRODUCTION.md §4 : la structure des tables reste dans le fichier, seules les lignes
# disparaissent. Une restauration rend ainsi une base complète et utilisable tout de suite,
# là où des tables absentes laisseraient l'application en erreur jusqu'à la migration suivante.
set -euo pipefail

RACINE="${RACINE:-/home/ubuntu/allezou}"
DEST="${DEST:-$RACINE/sauvegardes}"
JOURS="${JOURS:-30}"

EPHEMERES=(
  publication
  publication_circle
  publication_participant
  publication_participant_child
  publication_hidden_from
)

exclusions=()
for table in "${EPHEMERES[@]}"; do exclusions+=("--exclude-table-data=$table"); done

mkdir -p "$DEST"
chmod 700 "$DEST"
fichier="$DEST/allezou-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"

docker compose -f "$RACINE/docker-compose.prod.yml" exec -T postgres \
  pg_dump -U totir -d totir --no-owner --no-privileges "${exclusions[@]}" \
  | gzip -9 > "$fichier.partiel"

# Renommée seulement une fois écrite en entier : un fichier tronqué par un disque plein ou un
# arrêt en cours de route ne doit pas ressembler à une sauvegarde valable.
mv "$fichier.partiel" "$fichier"
chmod 600 "$fichier"

find "$DEST" -name 'allezou-*.sql.gz' -mtime "+$JOURS" -delete
find "$DEST" -name '*.partiel' -mtime +1 -delete

echo "$(date -u +%FT%TZ) $fichier $(stat -c %s "$fichier") octets"
