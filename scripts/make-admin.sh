#!/usr/bin/env bash
# ============================================================
# Donne (ou retire) le droit administrateur à un compte du portail.
# Le compte doit déjà exister (inscription normale sur le portail).
#
#   ./scripts/make-admin.sh admin@sharedmoodle.fr            # sur la VM (Swarm)
#   ./scripts/make-admin.sh admin@sharedmoodle.fr retirer
#   LOCAL=1 ./scripts/make-admin.sh test@pau.fr              # lancement local (Compose)
#
# Volontairement hors de l'application : aucune page ni API ne peut
# rendre un compte administrateur.
# ============================================================

set -euo pipefail

EMAIL="${1:?Usage : $0 <email> [retirer]}"
VALEUR=true
[[ "${2:-}" == "retirer" ]] && VALEUR=false
MANAGER="${MANAGER:-manager1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SQL="UPDATE clients SET est_admin = $VALEUR WHERE email = :'email' RETURNING email, est_admin;"

if [[ "${LOCAL:-0}" == "1" ]]; then
  echo "$SQL" | docker compose -f "$ROOT/docker-compose.dev.yml" exec -T postgres \
    psql -U smadmin -d sharedmoodle -v ON_ERROR_STOP=1 -v email="$EMAIL"
  exit 0
fi

# Swarm : trouver le nœud et le conteneur de PostgreSQL
node="$(docker exec "$MANAGER" docker service ps sharedmoodle_postgres --filter desired-state=running --format '{{.Node}}' | head -1)"
[[ -z "$node" ]] && { echo "PostgreSQL introuvable dans le Swarm"; exit 1; }
nc="$node"
docker inspect "$nc" >/dev/null 2>&1 || nc="$(for c in $(docker ps -q); do [[ "$(docker inspect -f '{{.Config.Hostname}}' "$c")" == "$node" ]] && echo "$c"; done | head -1)"
cid="$(docker exec "$nc" docker ps -q --filter label=com.docker.swarm.service.name=sharedmoodle_postgres | head -1)"
echo "$SQL" | docker exec -i "$nc" docker exec -i "$cid" \
  psql -U smadmin -d sharedmoodle -v ON_ERROR_STOP=1 -v email="$EMAIL"
echo "Le compte doit se reconnecter pour voir le menu Admin."
