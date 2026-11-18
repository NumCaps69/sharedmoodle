#!/usr/bin/env bash
# ============================================================
# Tests d'isolation entre deux établissements (D2), sur la VM.
#
#   ./scripts/test-isolation.sh pau bayonne
#
# Vérifie que A et B ont chacun :
#   1. leur réseau : le Moodle de A ne joint pas la base de B
#   2. leurs identifiants : le mot de passe de A est refusé par la base de B
#   3. leurs secrets : le Moodle de A ne reçoit que les secrets de A
#   4. leurs volumes : des volumes séparés
#   5. leur site : chaque adresse affiche son propre Moodle
# Résultat affiché et enregistré dans docs/preuves/isolation-<A>-<B>.txt
# ============================================================

set -uo pipefail

A="${1:?Usage : $0 <etablissement A> <etablissement B>}"
B="${2:?Usage : $0 <etablissement A> <etablissement B>}"
MANAGER="${MANAGER:-manager1}"
TARGET_IP="${TARGET_IP:-127.0.0.1}"
DOMAIN="${DOMAIN:-sharedmoodle}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/docs/preuves/isolation-${A}-${B}.txt"
mkdir -p "$(dirname "$OUT")"

mgr() { docker exec "$MANAGER" docker "$@"; }
ok=0; ko=0
resultat() { # $1 = PASS/FAIL, $2 = message
  if [[ "$1" == PASS ]]; then ok=$((ok + 1)); else ko=$((ko + 1)); fi
  echo "[$1] $2" | tee -a "$OUT"
}

# Conteneur DinD qui porte un nœud Swarm (nom ou hostname)
node_container() {
  local node="$1" c
  if docker inspect "$node" >/dev/null 2>&1; then echo "$node"; return; fi
  for c in $(docker ps -q); do
    [[ "$(docker inspect -f '{{.Config.Hostname}}' "$c")" == "$node" ]] && { echo "$c"; return; }
  done
}

# Exécute une commande dans une tâche d'un service : task_exec <service> <cmd...>
task_exec() {
  local svc="$1"; shift
  local node nc cid
  node="$(mgr service ps "$svc" --filter desired-state=running --format '{{.Node}}' | head -1)"
  nc="$(node_container "$node")"
  cid="$(docker exec "$nc" docker ps -q --filter "label=com.docker.swarm.service.name=$svc" | head -1)"
  [[ -z "$cid" ]] && { echo "tâche introuvable : $svc" >&2; return 99; }
  docker exec "$nc" docker exec "$cid" "$@"
}

php_connect() { # php_connect <service> <hôte> : 0 si le port 3306 répond
  task_exec "$1" php -r "exit(@fsockopen('$2', 3306, \$e, \$s, 3) ? 0 : 1);"
}

echo "=== Isolation $A / $B — $(date '+%F %T') ===" | tee "$OUT"

# 1. Réseau
if php_connect "sm-${A}_moodle" db; then resultat PASS "réseau : le Moodle de $A joint sa propre base"; else resultat FAIL "réseau : le Moodle de $A ne joint pas sa base"; fi
if php_connect "sm-${A}_moodle" "sm-${B}_db"; then resultat FAIL "réseau : le Moodle de $A joint la base de $B"; else resultat PASS "réseau : le Moodle de $A ne joint pas la base de $B"; fi
if php_connect "sm-${B}_moodle" "sm-${A}_db"; then resultat FAIL "réseau : le Moodle de $B joint la base de $A"; else resultat PASS "réseau : le Moodle de $B ne joint pas la base de $A"; fi

# 2. Identifiants : depuis l'API (seul service sur le réseau sm_admin)
creds() { # creds <établissement du mot de passe> <base visée>
  task_exec sharedmoodle_api node -e "
    const mysql = require('mysql2/promise');
    const { tenantDbPassword } = require('./src/services/tenants');
    mysql.createConnection({ host: 'sm-$2_db', user: 'moodle', database: 'moodle', password: tenantDbPassword('$1'), connectTimeout: 3000 })
      .then((c) => { c.end(); console.log('accepte'); })
      .catch((e) => console.log(e.code || e.message));"
}
r="$(creds "$B" "$B")"; [[ "$r" == accepte ]] && resultat PASS "identifiants : le mot de passe de $B ouvre la base de $B" || resultat FAIL "identifiants : base de $B : $r"
r="$(creds "$A" "$B")"; [[ "$r" == ER_ACCESS_DENIED_ERROR ]] && resultat PASS "identifiants : le mot de passe de $A est refusé par la base de $B" || resultat FAIL "identifiants : mot de passe de $A sur la base de $B : $r"

# 3. Secrets
s="$(mgr service inspect -f '{{range .Spec.TaskTemplate.ContainerSpec.Secrets}}{{.SecretName}} {{end}}' "sm-${A}_moodle")"
if [[ "$s" == *"sm-${A}_"* && "$s" != *"sm-${B}_"* ]]; then resultat PASS "secrets : le Moodle de $A reçoit seulement : $s"; else resultat FAIL "secrets : $s"; fi

# 4. Volumes (sur tous les nœuds)
vols="$(for n in $(mgr node ls --format '{{.Hostname}}'); do docker exec "$(node_container "$n")" docker volume ls -q; done | grep -E "^sm-(${A}|${B})_" | sort -u | tr '\n' ' ')"
if [[ "$vols" == *"sm-${A}_db-data"* && "$vols" == *"sm-${B}_db-data"* ]]; then resultat PASS "volumes : séparés : $vols"; else resultat FAIL "volumes : $vols"; fi

# 5. Sites
titre() { curl -s -m 10 -H "Host: $1.${DOMAIN}" "http://${TARGET_IP}/login/index.php" | grep -o '<title>[^<]*' | head -1; }
ta="$(titre "$A")"; tb="$(titre "$B")"
if [[ -n "$ta" && -n "$tb" && "$ta" != "$tb" ]]; then resultat PASS "sites : $A.${DOMAIN} = « ${ta#<title>} », $B.${DOMAIN} = « ${tb#<title>} »"; else resultat FAIL "sites : « $ta » / « $tb »"; fi

echo "=== $ok réussis, $ko échoués ===" | tee -a "$OUT"
[[ "$ko" -eq 0 ]]
