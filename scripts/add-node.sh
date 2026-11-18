#!/usr/bin/env bash
# ============================================================
# Ajoute un nœud au Swarm (conteneur Docker-in-Docker), sur la VM.
#
#   ./scripts/add-node.sh worker3              # nouveau nœud "app" (Moodle des établissements)
#   ./scripts/add-node.sh worker4 db           # nouveau nœud "db"
#   CPUS=2 MEMORY=3g ./scripts/add-node.sh worker3
#
# Avec 2 nœuds "app" et le stockage NFS (scripts/setup-nfs.sh), le Moodle
# d'un établissement redémarre sur l'autre nœud si le sien tombe.
# Le nœud est créé sur le même réseau Docker que le manager, donc il
# joint aussi le serveur NFS "sm-nfs".
# ============================================================

set -euo pipefail

NOM="${1:?Usage : $0 <nom du nœud> [role: app|db]}"
ROLE="${2:-app}"
MANAGER="${MANAGER:-manager1}"
IMAGE="${IMAGE:-docker:27-dind}"
PREPULL="${PREPULL:-bitnamilegacy/moodle:latest mariadb:10.11}"
NET="${NET:-$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$MANAGER" | awk '{print $1}')}"
mgr() { docker exec "$MANAGER" docker "$@"; }

[[ "$ROLE" =~ ^(app|db)$ ]] || { echo "Rôle inconnu : $ROLE (app ou db)"; exit 1; }
docker inspect "$NOM" >/dev/null 2>&1 && { echo "Le conteneur $NOM existe déjà"; exit 1; }

limites=()
[[ -n "${CPUS:-}" ]] && limites+=(--cpus "$CPUS")
[[ -n "${MEMORY:-}" ]] && limites+=(--memory "$MEMORY")

echo "1. Conteneur $NOM sur le réseau $NET"
docker run -d --privileged --name "$NOM" --hostname "$NOM" --network "$NET" \
  --restart unless-stopped ${limites[@]+"${limites[@]}"} "$IMAGE" >/dev/null
for _ in $(seq 1 30); do docker exec "$NOM" docker info >/dev/null 2>&1 && break; sleep 2; done

echo "2. Entrée dans le Swarm"
join="$(mgr swarm join-token worker | grep 'docker swarm join')"
docker exec "$NOM" sh -c "$join" >/dev/null
for _ in $(seq 1 15); do mgr node ls --format '{{.Hostname}} {{.Status}}' | grep -q "^$NOM Ready" && break; sleep 2; done

echo "3. Étiquette role=$ROLE"
mgr node update --label-add "role=$ROLE" "$NOM" >/dev/null

if [[ "$ROLE" == "app" && -n "$PREPULL" ]]; then
  echo "4. Images téléchargées à l'avance (relance plus rapide en cas de panne)"
  for img in $PREPULL; do docker exec "$NOM" docker pull -q "$img" >/dev/null && echo "   $img"; done
fi

mgr node ls
echo "Nœud $NOM prêt. Les services de rôle $ROLE peuvent maintenant y tourner."
