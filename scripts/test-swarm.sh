#!/usr/bin/env bash
# ============================================================
# Tests de tolérance aux pannes du Swarm (E4), sur la VM.
#
#   ./scripts/test-swarm.sh                          # panne : worker1, maintenance : worker2
#   NODE=worker2 DRAIN_NODE=worker1 ./scripts/test-swarm.sh
#
# 1. Quorum : nombre de managers et pannes de managers supportées
# 2. Panne : arrêt brutal du conteneur d'un nœud, le Swarm relance ses
#    tâches sur les nœuds restants (si les contraintes le permettent)
# 3. Retour : le nœud revient, tous les services retrouvent leurs copies
# 4. Maintenance : "drain" d'un autre nœud, ses tâches partent ailleurs
# Résultat affiché et enregistré dans docs/preuves/swarm-<date>.txt
# ============================================================

set -uo pipefail

MANAGER="${MANAGER:-manager1}"
NODE="${NODE:-worker1}"                # conteneur DinD du nœud à arrêter
DRAIN_NODE="${DRAIN_NODE:-worker2}"    # nœud mis en maintenance
WAIT="${WAIT:-90}"                     # secondes max pour chaque étape
SETTLE="${SETTLE:-20}"                 # secondes laissées au Swarm pour replacer les tâches
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/docs/preuves/swarm-$(date +%Y%m%d-%H%M).txt"
mkdir -p "$(dirname "$OUT")"

mgr() { docker exec "$MANAGER" docker "$@"; }
ok=0; ko=0
resultat() { # $1 = PASS/FAIL/INFO, $2 = message
  case "$1" in PASS) ok=$((ok + 1)) ;; FAIL) ko=$((ko + 1)) ;; esac
  echo "[$1] $2" | tee -a "$OUT"
}
titre() { echo | tee -a "$OUT"; echo "--- $* ---" | tee -a "$OUT"; }

# Hostname Swarm du conteneur DinD (souvent identique au nom)
node_hostname() { docker exec "$1" docker info --format '{{.Name}}' 2>/dev/null || echo "$1"; }

# Tâches en marche sur un nœud : "service.N" par ligne
tasks_on() { mgr node ps "$1" --filter desired-state=running --format '{{.Name}}' 2>/dev/null | grep -v '^$'; }

# Services dont une tâche voulue n'est pas en marche (en attente d'un nœud, en démarrage...).
# "docker service ls" compte encore les tâches d'un nœud Down : on lit "service ps".
services_incomplets() {
  local s etats
  for s in $(mgr service ls --format '{{.Name}}'); do
    etats="$(mgr service ps "$s" --filter desired-state=running --format '{{.CurrentState}}' | grep -vc '^Running')"
    (( etats > 0 )) && echo "$s ($etats en attente)"
  done
}

node_status() { mgr node ls --format '{{.Hostname}} {{.Status}}' | awk -v h="$1" '$1 == h { print $2 }'; }

# Attend qu'une condition soit vraie, affiche le temps écoulé
attendre() { # attendre <secondes> <fonction> <args...>
  local max="$1" t=0; shift
  until "$@"; do
    sleep 3; t=$((t + 3))
    (( t >= max )) && return 1
  done
  echo "$t"
}
est_down() { [[ "$(node_status "$1")" == "Down" ]]; }
est_ready() { [[ "$(node_status "$1")" == "Ready" ]]; }
services_complets() { [[ -z "$(services_incomplets)" ]]; }
est_vide() { [[ -z "$(tasks_on "$1")" ]]; }

portail() { curl -s -o /dev/null -w '%{http_code}' -m 5 -H 'Host: portail.sharedmoodle' "http://${TARGET_IP:-127.0.0.1}/"; }

echo "=== Tests Swarm : $(date '+%F %T') ===" | tee "$OUT"
mgr node ls | tee -a "$OUT"
H="$(node_hostname "$NODE")"
D="$(node_hostname "$DRAIN_NODE")"

# ---------- 1. Quorum ----------
titre "1. Quorum des managers"
managers="$(mgr node ls --filter role=manager -q | wc -l | tr -d ' ')"
resultat INFO "$managers manager(s) : quorum = $(( managers / 2 + 1 )), pannes de managers supportées = $(( (managers - 1) / 2 ))"
if (( managers < 3 )); then
  resultat INFO "Avec 1 manager, sa panne bloque les changements (déploiement, relance) ; les conteneurs déjà lancés continuent. Avec 3 managers, le cluster en supporte 1 : docker node promote worker1 worker2"
fi

# ---------- 2. Panne brutale ----------
titre "2. Panne : arrêt du nœud $H"
perdues="$(tasks_on "$H")"
resultat INFO "tâches sur $H avant la panne : $(echo "$perdues" | grep -c . | tr -d ' ') ($(echo "$perdues" | tr '\n' ' '))"
debut=$(date +%s)
docker stop "$NODE" >/dev/null
if t="$(attendre "$WAIT" est_down "$H")"; then
  resultat PASS "panne : $H vu Down par le manager en ${t}s"
else
  resultat FAIL "panne : $H pas vu Down après ${WAIT}s"
fi
sleep "$SETTLE"
inc="$(services_incomplets)"
if [[ -z "$inc" ]]; then
  resultat PASS "panne : toutes les tâches relancées sur d'autres nœuds en $(( $(date +%s) - debut ))s"
else
  resultat INFO "panne : services sans autre nœud possible (contrainte de placement) : $(echo "$inc" | tr '\n' ';')"
fi
code="$(portail)"
[[ "$code" == 200 ]] && resultat PASS "panne : le portail répond pendant la panne (HTTP 200)" || resultat FAIL "panne : le portail répond $code"

# ---------- 3. Retour ----------
titre "3. Retour du nœud $H"
docker start "$NODE" >/dev/null
if t="$(attendre "$WAIT" est_ready "$H")"; then
  resultat PASS "retour : $H de nouveau Ready en ${t}s"
else
  resultat FAIL "retour : $H pas Ready après ${WAIT}s"
fi
if t="$(attendre "$WAIT" services_complets)"; then
  resultat PASS "retour : tous les services ont leurs copies en ${t}s"
else
  inc="$(services_incomplets)"
  resultat FAIL "retour : services incomplets : $(echo "$inc" | tr '\n' ';')"
fi
resultat INFO "le Swarm ne rééquilibre pas seul les copies vers $H : docker service update --force <service> si besoin"

# ---------- 4. Maintenance (drain) ----------
titre "4. Maintenance : drain de $D"
avant="$(tasks_on "$D" | grep -c . | tr -d ' ')"
mgr node update --availability drain "$D" >/dev/null
if t="$(attendre "$WAIT" est_vide "$D")"; then
  resultat PASS "drain : $avant tâche(s) retirée(s) de $D en ${t}s"
else
  resultat FAIL "drain : des tâches restent sur $D après ${WAIT}s"
fi
sleep "$SETTLE"
inc="$(services_incomplets)"
[[ -z "$inc" ]] && resultat PASS "drain : tous les services gardent leurs copies" \
                || resultat INFO "drain : services sans autre nœud possible (contrainte de placement) : $(echo "$inc" | tr '\n' ';')"
code="$(portail)"
[[ "$code" == 200 ]] && resultat PASS "drain : le portail répond (HTTP 200)" || resultat FAIL "drain : le portail répond $code"
mgr node update --availability active "$D" >/dev/null
if t="$(attendre "$((WAIT * 2))" services_complets)"; then
  resultat PASS "maintenance finie : $D remis en service, tous les services ont leurs copies en ${t}s"
else
  resultat FAIL "maintenance finie : services incomplets : $(services_incomplets | tr '\n' ';')"
fi

titre "État final"
mgr service ls | tee -a "$OUT"
echo | tee -a "$OUT"
echo "=== $ok réussis, $ko échoués ===" | tee -a "$OUT"
[[ "$ko" -eq 0 ]]
