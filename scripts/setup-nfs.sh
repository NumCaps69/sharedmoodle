#!/usr/bin/env bash
# ============================================================
# Serveur NFS du stockage partagé (E2), sur la VM.
#
#   ./scripts/setup-nfs.sh            # lance le serveur NFS "sm-nfs"
#   ./scripts/setup-nfs.sh test       # vérifie qu'un nœud peut y écrire
#
# Le serveur tourne dans un conteneur sur le même réseau Docker que les
# nœuds (manager1, worker1...). Les nœuds le joignent par son nom "sm-nfs".
# Les fichiers sont sur la VM dans $NFS_DIR (sauvegarde simple : copier ce dossier).
#
# Ensuite, dans docker-compose.yml (service provisioner) :
#   NFS_ADDR: sm-nfs
# puis redéployer la pile. Les nouveaux établissements auront leurs
# fichiers Moodle sur NFS ; les établissements existants gardent leurs
# volumes locaux.
# ============================================================

set -euo pipefail

MANAGER="${MANAGER:-manager1}"
NODES="${NODES:-manager1 worker1 worker2}"
NFS_DIR="${NFS_DIR:-$HOME/sharedmoodle-nfs}"
NFS_IMAGE="${NFS_IMAGE:-itsthenetwork/nfs-server-alpine:12}"
NET="${NET:-$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$MANAGER" | awk '{print $1}')}"

test_nodes() {
  local n
  for n in $NODES; do
    docker exec "$n" docker volume rm -f sm-nfs-test >/dev/null 2>&1 || true
    if docker exec "$n" docker volume create --driver local --opt type=nfs \
         --opt o=addr=sm-nfs,rw,nfsvers=4,soft,timeo=100 --opt device=:/ sm-nfs-test >/dev/null &&
       docker exec "$n" docker run --rm -v sm-nfs-test:/nfs alpine:3.20 sh -c "echo $n > /nfs/.test-$n && cat /nfs/.test-$n" >/dev/null; then
      echo "[PASS] $n écrit sur le serveur NFS"
    else
      echo "[FAIL] $n ne peut pas monter sm-nfs"
    fi
    docker exec "$n" docker volume rm -f sm-nfs-test >/dev/null 2>&1 || true
  done
  ls -la "$NFS_DIR"
}

if [[ "${1:-}" == "test" ]]; then test_nodes; exit 0; fi

mkdir -p "$NFS_DIR"
if docker inspect sm-nfs >/dev/null 2>&1; then
  echo "sm-nfs existe déjà"
else
  docker run -d --name sm-nfs --hostname sm-nfs --restart unless-stopped --privileged \
    --network "$NET" \
    -v "$NFS_DIR":/nfsshare \
    -e SHARED_DIRECTORY=/nfsshare \
    "$NFS_IMAGE" >/dev/null
  echo "Serveur NFS sm-nfs lancé sur le réseau $NET (fichiers dans $NFS_DIR)"
  sleep 5
fi
test_nodes
echo "Mettre NFS_ADDR: sm-nfs dans le service provisioner (docker-compose.yml), puis redéployer."
