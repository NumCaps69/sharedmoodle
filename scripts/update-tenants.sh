#!/usr/bin/env bash
# ============================================================
# Redéploie les piles de tous les établissements (sm-<slug>) avec le
# tenant-stack.yml de la version actuelle du provisioner, en gardant
# leur forfait, leur stockage et leurs données.
# À lancer après un "docker stack deploy" qui a changé le provisioner.
#
#   ./scripts/update-tenants.sh            # tous les établissements
#   ./scripts/update-tenants.sh pau        # un seul
# ============================================================
set -euo pipefail

MANAGER="${MANAGER:-manager1}"
mgr() { docker exec "$MANAGER" docker "$@"; }

cid="$(mgr ps -q --filter label=com.docker.swarm.service.name=sharedmoodle_provisioner | head -1)"
[[ -z "$cid" ]] && { echo "Provisioner introuvable sur $MANAGER"; exit 1; }

if [[ $# -gt 0 ]]; then
  slugs="$*"
else
  slugs="$(mgr stack ls --format '{{.Name}}' | sed -n 's/^sm-//p')"
fi
[[ -z "$slugs" ]] && { echo "Aucun établissement"; exit 0; }

for slug in $slugs; do
  plan="$(mgr service inspect "sm-${slug}_moodle" --format '{{index .Spec.Labels "sharedmoodle.plan"}}' 2>/dev/null || true)"
  [[ -z "$plan" ]] && { echo "sm-$slug : pile introuvable, ignorée"; continue; }
  # Même appel que l'API lors d'un changement de forfait (jeton lu dans le secret du provisioner)
  mgr exec -e SLUG="$slug" -e PLAN="$plan" "$cid" node -e '
    const fs = require("fs");
    const token = fs.readFileSync("/run/secrets/sm_provisioner_token", "utf8").trim();
    fetch(`http://127.0.0.1:4000/tenants/${process.env.SLUG}/plan`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Provisioner-Token": token },
      body: JSON.stringify({ plan: process.env.PLAN }),
    }).then(async (r) => { console.log(`sm-${process.env.SLUG} (${process.env.PLAN}) : HTTP ${r.status}`); if (!r.ok) { console.log(await r.text()); process.exit(1); } })
      .catch((e) => { console.error(e.message); process.exit(1); });'
done
echo "Les Moodle redémarrent (1 à 3 minutes) : docker exec $MANAGER docker service ls --filter name=sm-"
