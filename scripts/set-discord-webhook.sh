#!/usr/bin/env bash
# ============================================================
# Change l'adresse du webhook Discord des alertes (sur la VM).
#
#   ./scripts/set-discord-webhook.sh 'https://discord.com/api/webhooks/...'
#   ./scripts/set-discord-webhook.sh test     # envoie une alerte de test
#
# Un Docker secret ne se modifie pas : on le retire d'Alertmanager,
# on le recrée avec la nouvelle valeur, puis on le redonne (2 s sans alertes).
# Discord : Paramètres du serveur, Intégrations, Webhooks, Nouveau webhook, Copier l'URL.
# ============================================================

set -euo pipefail

MANAGER="${MANAGER:-manager1}"
SERVICE="${SERVICE:-sharedmoodle_alertmanager}"
NOM=sm_alert_discord_webhook
ARG="${1:?Usage : $0 <url du webhook Discord> | test}"
mgr() { docker exec "$MANAGER" docker "$@"; }

if [[ "$ARG" == "test" ]]; then
  # Alerte factice envoyée directement à Alertmanager (depuis son conteneur)
  cid="$(mgr ps -q --filter "label=com.docker.swarm.service.name=$SERVICE" | head -1)"
  [[ -z "$cid" ]] && { echo "Alertmanager introuvable sur $MANAGER"; exit 1; }
  mgr exec "$cid" amtool alert add TestSharedMoodle severity=warning tenant=test \
    --annotation='summary="Test : les alertes SharedMoodle arrivent bien sur Discord"' \
    --alertmanager.url=http://127.0.0.1:9093
  echo "Alerte de test envoyée : elle arrive sur Discord dans ~30 s."
  exit 0
fi

[[ "$ARG" =~ ^https://(discord\.com|discordapp\.com)/api/webhooks/ ]] || { echo "Adresse inattendue (https://discord.com/api/webhooks/...)"; exit 1; }

# Le secret garde le même nom (celui du docker-compose.yml) : on le retire
# d'Alertmanager, on le recrée avec la nouvelle valeur, puis on le redonne.
mgr service update --detach=false -q --secret-rm "$NOM" "$SERVICE" >/dev/null
mgr secret rm "$NOM" >/dev/null
printf '%s' "$ARG" | mgr secret create "$NOM" - >/dev/null
mgr service update --detach=false -q --secret-add "source=$NOM,target=$NOM" "$SERVICE" >/dev/null
echo "Webhook Discord mis à jour. Tester : $0 test"
