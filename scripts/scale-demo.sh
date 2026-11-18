#!/usr/bin/env bash
# ============================================================
# Démos de scalabilité (B1 et B2), à lancer sur la VM.
#
#   ./scripts/scale-demo.sh horizontal [service] [n]   # B1 : changer le nombre de copies
#   ./scripts/scale-demo.sh vertical   [service]       # B2 : changer les limites CPU/mémoire du service
#   ./scripts/scale-demo.sh noeud      [noeud]         # B2 : changer CPU/mémoire d'un nœud (conteneur DinD)
#   ./scripts/scale-demo.sh reset                      # remettre les valeurs du docker-compose.yml
#
# Horizontal = plus de copies (réplicas) ; vertical = plus de ressources par copie ou par nœud.
# ============================================================

set -euo pipefail

MANAGER="${MANAGER:-manager1}"
STACK="${STACK:-sharedmoodle}"
mgr() { docker exec "$MANAGER" docker "$@"; }
titre() { echo; echo "=== $* ==="; }

etat() {
  local svc="$1"
  mgr service ls --filter "name=$svc" --format 'table {{.Name}}\t{{.Replicas}}\t{{.Image}}'
  mgr service ps "$svc" --filter desired-state=running --format 'table {{.Name}}\t{{.Node}}\t{{.CurrentState}}'
  mgr service inspect -f 'Limites : {{.Spec.TaskTemplate.Resources.Limits.NanoCPUs}} nanoCPU, {{.Spec.TaskTemplate.Resources.Limits.MemoryBytes}} octets' "$svc"
}

horizontal() {
  local svc="${STACK}_${1:-api}" n="${2:-4}" avant
  avant="$(mgr service inspect -f '{{.Spec.Mode.Replicated.Replicas}}' "$svc")"
  titre "Avant : $svc"; etat "$svc"
  titre "Scale out : $avant -> $n copies"
  mgr service scale "$svc=$n"
  etat "$svc"
  titre "Répartition : chaque appel peut être servi par une copie différente"
  for _ in 1 2 3 4 5 6; do
    curl -s -m 3 -H "Host: api.sharedmoodle" "http://127.0.0.1/api/health" | grep -o '"instance":"[^"]*"' || true
  done
  titre "Scale in : retour à $avant copies"
  mgr service scale "$svc=$avant"
  etat "$svc"
}

vertical() {
  local svc="${STACK}_${1:-api}"
  titre "Avant : $svc"; etat "$svc"
  titre "Scale up : limite 1 CPU / 512 Mo (mise à jour continue, sans coupure)"
  mgr service update --limit-cpu 1 --limit-memory 512M --reserve-cpu 0.2 --reserve-memory 192M "$svc"
  etat "$svc"
  titre "Scale down : retour à 0,5 CPU / 256 Mo"
  mgr service update --limit-cpu 0.5 --limit-memory 256M --reserve-cpu 0.1 --reserve-memory 128M "$svc"
  etat "$svc"
}

noeud() {
  local node="${1:-worker1}"
  titre "Ressources du nœud $node (conteneur Docker-in-Docker sur la VM)"
  docker inspect -f 'CPU : {{.HostConfig.NanoCpus}} nanoCPU (0 = sans limite), mémoire : {{.HostConfig.Memory}} octets (0 = sans limite)' "$node"
  titre "Scale up du nœud : 2 CPU / 4 Go, sans arrêt"
  docker update --cpus 2 --memory 4g --memory-swap 4g "$node"
  docker inspect -f 'CPU : {{.HostConfig.NanoCpus}} nanoCPU, mémoire : {{.HostConfig.Memory}} octets' "$node"
  titre "Scale down du nœud : 1 CPU / 2 Go"
  docker update --cpus 1 --memory 2g --memory-swap 2g "$node"
  docker inspect -f 'CPU : {{.HostConfig.NanoCpus}} nanoCPU, mémoire : {{.HostConfig.Memory}} octets' "$node"
  echo "Note : sur des VM réelles (Proxmox), le scale up d'un nœud = ajouter vCPU/RAM à la VM."
}

reset() {
  titre "Retour aux valeurs du docker-compose.yml"
  mgr service update --limit-cpu 0.5 --limit-memory 256M --reserve-cpu 0.1 --reserve-memory 128M "${STACK}_api"
  for s in api frontend moodle; do mgr service scale -d "${STACK}_$s=2"; done
  echo "Nœuds : docker update --cpus 0 --memory 0 ne retire pas une limite mémoire ; recréer le nœud si besoin."
}

case "${1:-}" in
  horizontal) shift; horizontal "$@" ;;
  vertical)   shift; vertical "$@" ;;
  noeud)      shift; noeud "$@" ;;
  reset)      reset ;;
  *) sed -n '3,10p' "$0"; exit 1 ;;
esac
