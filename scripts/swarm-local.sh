#!/usr/bin/env bash
# ============================================================
# Copie locale du cluster de la VM (Mac ou PC avec Docker Desktop, 8 Go de mémoire).
#
#   ./scripts/swarm-local.sh             # crée manager1, worker1 (app), worker2 (db) et déploie la pile
#   ./scripts/swarm-local.sh deployer    # reconstruit les images et redéploie (après une modif du code)
#   ./scripts/swarm-local.sh supprimer   # supprime les nœuds et toutes leurs données
#
# Mêmes noms de nœuds que sur la VM : les scripts de test (test-isolation.sh,
# test-swarm.sh, autoscaler.sh, load-test.sh, scale-demo.sh...) marchent sans changement.
# Les images de la plateforme sont construites sur la machine (sm-local/...), pas
# téléchargées : celles de Docker Hub sont en amd64, pour la VM.
# Les alertes vont à un faux Discord : docker exec manager1 docker service logs -f sm-alert-receiver
# ============================================================

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NET="sm-local"
DIND="docker:27-dind"
VERSION="$(cat "$ROOT/portal/frontend/version.txt" 2>/dev/null || echo 1.1.0)"
APPS="api frontend provisioner prometheus grafana alertmanager"
mgr() { docker exec manager1 docker "$@"; }

supprimer() {
  echo "Suppression des nœuds locaux et de leurs données"
  docker rm -f -v manager1 worker1 worker2 worker3 >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}

attendre_docker() {
  for _ in $(seq 1 30); do docker exec "$1" docker info >/dev/null 2>&1 && return 0; sleep 2; done
  echo "Docker ne démarre pas dans $1"; exit 1
}

charger() { # charger <nœud> <images...> : copie des images du poste vers le nœud
  local node="$1"; shift
  docker save "$@" | docker exec -i "$node" docker load -q >/dev/null
}

construire() {
  echo "Construction des images de la plateforme (version $VERSION)"
  for app in $APPS; do
    case "$app" in
      api) dir="portal/backend" ;;
      prometheus|grafana|alertmanager) dir="monitoring/$app" ;;
      *) dir="portal/$app" ;;
    esac
    docker build -q -t "sm-local/sharedmoodle-$app:$VERSION" "$ROOT/$dir" >/dev/null
    echo "   sm-local/sharedmoodle-$app:$VERSION"
  done
  local imgs=()
  for app in $APPS; do imgs+=("sm-local/sharedmoodle-$app:$VERSION"); done
  charger manager1 "${imgs[@]}"
}

deployer() {
  construire
  echo "Déploiement de la pile sharedmoodle"
  sed "s#kasupremacy/sharedmoodle-\([a-z]*\):[0-9.]*#sm-local/sharedmoodle-\1:$VERSION#g" "$ROOT/docker-compose.yml" \
    | docker exec -i manager1 docker stack deploy --resolve-image never -c - sharedmoodle
  if ! mgr service inspect sm-alert-receiver >/dev/null 2>&1; then
    for _ in $(seq 1 15); do mgr network inspect sharedmoodle_monitoring >/dev/null 2>&1 && break; sleep 2; done
    mgr service create -q --name sm-alert-receiver --network sharedmoodle_monitoring \
      --constraint node.role==manager node:20-alpine node -e "require('http').createServer((q,r)=>{let b='';q.on('data',d=>b+=d);q.on('end',()=>{try{const m=JSON.parse(b);console.log('NOTIFICATION', JSON.stringify({titre:m.embeds?.[0]?.title,message:m.embeds?.[0]?.description}))}catch{console.log(b)}r.writeHead(204).end()})}).listen(8080)" >/dev/null
  fi
}

case "${1:-creer}" in
  supprimer) supprimer; exit 0 ;;
  deployer) deployer; mgr service ls; exit 0 ;;
  creer) ;;
  *) echo "Usage : $0 [creer|deployer|supprimer]"; exit 1 ;;
esac

for n in manager1 worker1 worker2; do
  docker inspect "$n" >/dev/null 2>&1 && { echo "Le conteneur $n existe déjà. Pour repartir de zéro : $0 supprimer"; exit 1; }
done

echo "1. Réseau $NET et nœuds Docker-in-Docker"
docker network create "$NET" >/dev/null
# manager1 reçoit le trafic du poste : 80 (Traefik), 9000 (Portainer), 8090 (tableau Traefik)
docker run -d --privileged --name manager1 --hostname manager1 --network "$NET" \
  -p 80:80 -p 9000:9000 -p 8090:8080 --restart unless-stopped "$DIND" >/dev/null
for n in worker1 worker2; do
  docker run -d --privileged --name "$n" --hostname "$n" --network "$NET" --restart unless-stopped "$DIND" >/dev/null
done
for n in manager1 worker1 worker2; do attendre_docker "$n"; done

echo "2. Swarm : manager1 + 2 workers"
mgr swarm init --advertise-addr eth0 >/dev/null
join="$(mgr swarm join-token worker | grep 'docker swarm join')"
for n in worker1 worker2; do docker exec "$n" sh -c "$join" >/dev/null; done
sleep 3
mgr node update --label-add role=manager manager1 >/dev/null
mgr node update --label-add role=app worker1 >/dev/null
mgr node update --label-add role=db worker2 >/dev/null

echo "3. Images publiques déjà présentes sur le poste (évite de les retélécharger)"
for img in bitnamilegacy/moodle:latest mariadb:10.11 postgres:16-alpine gcr.io/cadvisor/cadvisor:v0.49.1; do
  docker image inspect "$img" >/dev/null 2>&1 || docker pull -q "$img" >/dev/null
done
charger worker1 bitnamilegacy/moodle:latest mariadb:10.11 gcr.io/cadvisor/cadvisor:v0.49.1
charger worker2 mariadb:10.11 postgres:16-alpine gcr.io/cadvisor/cadvisor:v0.49.1
charger manager1 gcr.io/cadvisor/cadvisor:v0.49.1

echo "4. Réseau public et secrets (valeurs de test locales)"
mgr network create -d overlay --attachable proxy >/dev/null
SM_GRAFANA_ADMIN_PASSWORD=devgrafana \
SM_ALERT_DISCORD_WEBHOOK=http://sm-alert-receiver:8080/webhook \
OUT="$HOME/sharedmoodle-secrets-local.txt" \
MANAGER=manager1 "$ROOT/scripts/create-secrets.sh" >/dev/null

echo "5. Pile de la plateforme"
deployer

cat <<EOF

Cluster local prêt. Les services démarrent (2 à 5 minutes) :
  docker exec manager1 docker service ls

Ajouter cette ligne dans /etc/hosts (sudo nano /etc/hosts) :
  127.0.0.1 portail.sharedmoodle api.sharedmoodle grafana.sharedmoodle pau.sharedmoodle bayonne.sharedmoodle

Puis ouvrir http://portail.sharedmoodle, http://grafana.sharedmoodle (admin / devgrafana)
et http://localhost:9000 (Portainer, créer le compte admin à la première visite).
Faux Discord : docker exec manager1 docker service logs -f sm-alert-receiver
EOF
