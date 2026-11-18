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
#
# Source de la mesure (C3), variable SOURCE :
#   auto       (défaut) Prometheus s'il répond, sinon docker stats
#   prometheus règle "sharedmoodle:service_cpu_ratio" (cAdvisor, moyenne sur 1 min,
#              tous les nœuds) ; requête faite dans le conteneur Prometheus,
#              donc aucun port à publier
#   stats      docker stats sur chaque nœud (mesure instantanée)
# ============================================================

set -uo pipefail

MANAGER="${MANAGER:-manager1}"
NODES="${NODES:-manager1 worker1 worker2}"
# service:min:max
# Ajouter le Moodle d'un établissement, ex. "sm-pau_moodle:1:2"
SERVICES="${SERVICES:-sharedmoodle_api:2:6 sharedmoodle_frontend:2:6}"
UP="${UP:-70}"
DOWN="${DOWN:-25}"
INTERVAL="${INTERVAL:-15}"
COOLDOWN_UP="${COOLDOWN_UP:-30}"
COOLDOWN_DOWN="${COOLDOWN_DOWN:-90}"
LOG_CSV="${LOG_CSV:-autoscaler.csv}"
STATE_DIR="${STATE_DIR:-/tmp/sharedmoodle-autoscaler}"
DRY_RUN="${DRY_RUN:-0}"
ONCE="${ONCE:-0}"
SOURCE="${SOURCE:-auto}"
PROM_SERVICE="${PROM_SERVICE:-sharedmoodle_prometheus}"

mkdir -p "$STATE_DIR"
CSV_HEADER="date,service,replicas,cpu_pct_limite,action,nouveaux_replicas,source"
if [[ ! -f "$LOG_CSV" ]]; then
  echo "$CSV_HEADER" > "$LOG_CSV"
elif [[ "$(head -1 "$LOG_CSV")" != "$CSV_HEADER" ]]; then
  # Journal d'une ancienne version (sans la colonne source) : on le garde à part
  mv "$LOG_CSV" "${LOG_CSV%.csv}-ancien.csv"
  echo "$CSV_HEADER" > "$LOG_CSV"
fi

mgr() { docker exec "$MANAGER" docker "$@"; }
log() { echo "$(date '+%F %T') $*"; }

# ---------- Mesure par Prometheus (C3) ----------
urlencode() {
  local s="$1" out="" c i
  for ((i = 0; i < ${#s}; i++)); do
    c="${s:i:1}"
    case "$c" in
      [a-zA-Z0-9._~-]) out+="$c" ;;
      *) out+="$(printf '%%%02X' "'$c")" ;;
    esac
  done
  printf '%s' "$out"
}

# Requête PromQL instantanée, exécutée dans le conteneur Prometheus (sur le manager)
prom_query() {
  local cid
  cid="$(mgr ps -q --filter "label=com.docker.swarm.service.name=$PROM_SERVICE" | head -1)"
  [[ -z "$cid" ]] && return 1
  mgr exec "$cid" wget -q -T 5 -O - "http://127.0.0.1:9090/api/v1/query?query=$(urlencode "$1")" 2>/dev/null
}

# Première valeur d'une réponse JSON de Prometheus (vide si aucun résultat)
prom_value() {
  sed -nE 's/.*"value":\[[^,]*,"([^"]*)"\].*/\1/p' <<< "$1" | head -1
}

# % de la limite CPU d'un service selon Prometheus, ou rien si pas de mesure
# (la règle demande une limite CPU : sans limits.cpus, utiliser SOURCE=stats)
prom_cpu_pct() {
  local json v
  json="$(prom_query "sharedmoodle:service_cpu_ratio{service=\"$1\"}")" || return 1
  v="$(prom_value "$json")"
  [[ -z "$v" || "$v" == "NaN" ]] && return 1
  awk -v r="$v" 'BEGIN { printf "%d", r * 100 }'
}

# Copies en marche mesurées par cAdvisor
prom_tasks() {
  local v
  v="$(prom_value "$(prom_query "sharedmoodle:service_tasks{service=\"$1\"}")")"
  echo "${v:-0}"
}

choose_source() {
  if [[ "$SOURCE" == "stats" ]]; then echo stats; return; fi
  if prom_query 'up' | grep -q '"status":"success"'; then echo prometheus; return; fi
  [[ "$SOURCE" == "prometheus" ]] && { log "Prometheus injoignable ($PROM_SERVICE)" >&2; echo none; return; }
  echo stats
}

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
  local src stats="" entry svc min max replicas nano sum n avg pct last now action target
  src="$(choose_source)"
  [[ "$src" == "none" ]] && return
  [[ "$src" == "stats" ]] && stats="$(collect_stats)"
  now="$(date +%s)"

  for entry in $SERVICES; do
    IFS=':' read -r svc min max <<< "$entry"
    replicas="$(mgr service inspect -f '{{.Spec.Mode.Replicated.Replicas}}' "$svc" 2>/dev/null)" || { log "$svc introuvable"; continue; }

    if [[ "$src" == "prometheus" ]]; then
      pct="$(prom_cpu_pct "$svc")" || { log "$svc : pas de mesure Prometheus (limite CPU absente ou service trop récent)"; continue; }
      n="$(prom_tasks "$svc")"
    else
      nano="$(mgr service inspect -f '{{.Spec.TaskTemplate.Resources.Limits.NanoCPUs}}' "$svc" 2>/dev/null)"
      [[ -z "$nano" || "$nano" == "0" ]] && nano=1000000000   # sans limite : 1 cœur
      read -r sum n <<< "$(service_cpu "$svc" "$stats")"
      if [[ "$n" -eq 0 ]]; then log "$svc : aucune tâche mesurée"; continue; fi
      # % de la limite : CPUPerc 50 % = 0,5 cœur ; limite 0,5 cœur -> 100 %
      pct="$(awk -v s="$sum" -v n="$n" -v l="$nano" 'BEGIN { printf "%d", (s / n) * 1e9 / l }')"
    fi
    last="$(cat "$STATE_DIR/${svc}.last" 2>/dev/null || echo 0)"
    action="aucune"; target="$replicas"

    if (( pct > UP && replicas < max && now - last >= COOLDOWN_UP )); then
      target=$((replicas + 1)); action="monte"
    elif (( pct < DOWN && replicas > min && now - last >= COOLDOWN_DOWN )); then
      target=$((replicas - 1)); action="descend"
    elif (( replicas < min )); then
      target="$min"; action="minimum"
    fi

    log "$svc : $replicas réplicas, CPU $pct % de la limite ($n tâches, $src) -> $action"
    echo "$(date '+%F %T'),$svc,$replicas,$pct,$action,$target,$src" >> "$LOG_CSV"
    [[ "$target" != "$replicas" ]] && scale_service "$svc" "$target"
  done
}

log "Autoscaler démarré : services [$SERVICES], seuils $DOWN-$UP %, toutes les ${INTERVAL}s, source $SOURCE"
while true; do
  one_round
  [[ "$ONCE" == "1" ]] && break
  sleep "$INTERVAL"
done
