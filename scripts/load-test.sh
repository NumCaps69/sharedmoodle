#!/usr/bin/env bash
# ============================================================
# Test de charge (B4) avec ab (Apache Bench), pour déclencher l'autoscaler.
#
#   ./scripts/load-test.sh api                 # 120 s, 50 connexions simultanées
#   ./scripts/load-test.sh moodle 180 30
#   TARGET_IP=10.3.16.177 ./scripts/load-test.sh frontend   # depuis le Mac (VPN)
#
# Cibles (via Traefik, en-tête Host) :
#   api      -> api.sharedmoodle/api/health
#   frontend -> portail.sharedmoodle/
#   moodle   -> pau.sharedmoodle/login/index.php
#
# ab tourne dans un conteneur httpd:alpine si la commande ab n'est pas installée.
# Pendant le test, lancer l'autoscaler dans un autre terminal et suivre :
#   docker exec manager1 docker service ls
# ============================================================

set -euo pipefail

CIBLE="${1:-api}"
DUREE="${2:-120}"
CONCURRENCE="${3:-50}"
TARGET_IP="${TARGET_IP:-127.0.0.1}"
PORT="${PORT:-80}"

case "$CIBLE" in
  api)      HOST="api.sharedmoodle";     CHEMIN="/api/health" ;;
  frontend) HOST="portail.sharedmoodle"; CHEMIN="/" ;;
  moodle)   HOST="pau.sharedmoodle";     CHEMIN="/login/index.php" ;;
  *) echo "Cible inconnue : $CIBLE (api, frontend ou moodle)"; exit 1 ;;
esac

URL="http://${TARGET_IP}:${PORT}${CHEMIN}"
echo "Charge sur $HOST ($URL) : ${DUREE}s, $CONCURRENCE connexions simultanées"

if command -v ab >/dev/null 2>&1; then
  ab -t "$DUREE" -n 10000000 -c "$CONCURRENCE" -k -H "Host: $HOST" "$URL"
else
  # 127.0.0.1 = la machine elle-même : il faut le réseau de l'hôte
  NET=(); [[ "$TARGET_IP" == "127.0.0.1" ]] && NET=(--network host)
  docker run --rm ${NET[@]+"${NET[@]}"} httpd:alpine \
    ab -t "$DUREE" -n 10000000 -c "$CONCURRENCE" -k -H "Host: $HOST" "$URL"
fi
