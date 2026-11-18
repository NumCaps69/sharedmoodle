#!/usr/bin/env bash
# ============================================================
# Autoscaler SharedMoodle (B3)
# Docker Swarm n'ajuste pas seul le nombre de réplicas : ce script
# mesure le CPU des tâches de chaque service et appelle
# "docker service scale" quand la charge monte ou descend.
#
# À lancer sur la VM (hôte des nœuds Docker-in-Docker) :
#   ./scripts/autoscaler.sh                       # en continu
#   ONCE=1 ./scripts/autoscaler.sh                # un seul tour (test)
#   DRY_RUN=1 ./scripts/autoscaler.sh             # décide sans rien changer
#   nohup ./scripts/autoscaler.sh > autoscaler.log 2>&1 &   # en arrière-plan
#
# Règle : CPU moyen des tâches, en % de leur limite CPU
#   > UP (70 %)   pendant un tour  -> +1 réplica (jusqu'à MAX)
#   < DOWN (25 %) pendant un tour  -> -1 réplica (jusqu'à MIN)
#   délai minimal entre deux actions : COOLDOWN_UP / COOLDOWN_DOWN
# Chaque décision est ajoutée à LOG_CSV (preuve pour le rapport).
# ============================================================

set -uo pipefail

MANAGER="${MANAGER:-manager1}"
NODES="${NODES:-manager1 worker1 worker2}"
# service:min:max
SERVICES="${SERVICES:-sharedmoodle_api:2:6 sharedmoodle_frontend:2:6 sharedmoodle_moodle:2:3}"
UP="${UP:-70}"
DOWN="${DOWN:-25}"
INTERVAL="${INTERVAL:-15}"
COOLDOWN_UP="${COOLDOWN_UP:-30}"
COOLDOWN_DOWN="${COOLDOWN_DOWN:-90}"
LOG_CSV="${LOG_CSV:-autoscaler.csv}"
STATE_DIR="${STATE_DIR:-/tmp/sharedmoodle-autoscaler}"
DRY_RUN="${DRY_RUN:-0}"
ONCE="${ONCE:-0}"

mkdir -p "$STATE_DIR"
[[ -f "$LOG_CSV" ]] || echo "date,service,replicas,cpu_pct_limite,action,nouveaux_replicas" > "$LOG_CSV"

mgr() { docker exec "$MANAGER" docker "$@"; }
log() { echo "$(date '+%F %T') $*"; }

# CPU de tous les conteneurs de tous les nœuds : lignes "nom;cpu"
collect_stats() {
  local node
  for node in $NODES; do
    docker exec "$node" docker stats --no-stream --format '{{.Name}};{{.CPUPerc}}' 2>/dev/null
  done
}

# Somme et nombre des CPU des tâches d'un service (conteneurs "service.N.xxx")
service_cpu() {
  local svc="$1" stats="$2"
  awk -F';' -v s="${svc}." 'index($1, s) == 1 { gsub("%", "", $2); sum += $2; n++ } END { printf "%.2f %d\n", sum, n }' <<< "$stats"
}

scale_service() {
  local svc="$1" target="$2"
  if [[ "$DRY_RUN" == "1" ]]; then
    log "DRY_RUN : $svc serait passé à $target réplicas"
  else
    mgr service scale -d "${svc}=${target}" >/dev/null
  fi
  date +%s > "$STATE_DIR/${svc}.last"
}

one_round() {
  local stats entry svc min max replicas nano sum n avg pct last now action target
  stats="$(collect_stats)"
  now="$(date +%s)"

  for entry in $SERVICES; do
    IFS=':' read -r svc min max <<< "$entry"
    replicas="$(mgr service inspect -f '{{.Spec.Mode.Replicated.Replicas}}' "$svc" 2>/dev/null)" || { log "$svc introuvable"; continue; }
    nano="$(mgr service inspect -f '{{.Spec.TaskTemplate.Resources.Limits.NanoCPUs}}' "$svc" 2>/dev/null)"
    [[ -z "$nano" || "$nano" == "0" ]] && nano=1000000000   # sans limite : 1 cœur

    read -r sum n <<< "$(service_cpu "$svc" "$stats")"
    if [[ "$n" -eq 0 ]]; then log "$svc : aucune tâche mesurée"; continue; fi

    # % de la limite : CPUPerc 50 % = 0,5 cœur ; limite 0,5 cœur -> 100 %
    pct="$(awk -v s="$sum" -v n="$n" -v l="$nano" 'BEGIN { printf "%d", (s / n) * 1e9 / l }')"
    last="$(cat "$STATE_DIR/${svc}.last" 2>/dev/null || echo 0)"
    action="aucune"; target="$replicas"

    if (( pct > UP && replicas < max && now - last >= COOLDOWN_UP )); then
      target=$((replicas + 1)); action="monte"
    elif (( pct < DOWN && replicas > min && now - last >= COOLDOWN_DOWN )); then
      target=$((replicas - 1)); action="descend"
    elif (( replicas < min )); then
      target="$min"; action="minimum"
    fi

    log "$svc : $replicas réplicas, CPU $pct % de la limite ($n tâches) -> $action"
    echo "$(date '+%F %T'),$svc,$replicas,$pct,$action,$target" >> "$LOG_CSV"
    [[ "$target" != "$replicas" ]] && scale_service "$svc" "$target"
  done
}

log "Autoscaler démarré : services [$SERVICES], seuils $DOWN-$UP %, toutes les ${INTERVAL}s"
while true; do
  one_round
  [[ "$ONCE" == "1" ]] && break
  sleep "$INTERVAL"
done
