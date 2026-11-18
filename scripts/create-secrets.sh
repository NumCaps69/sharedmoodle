#!/usr/bin/env bash
# Crée les Docker secrets de la pile SharedMoodle sur le manager Swarm.
# À lancer une seule fois sur la VM, avant "docker stack deploy".
#
#   ./scripts/create-secrets.sh            # valeurs aléatoires
#   MANAGER=manager1 ./scripts/create-secrets.sh
#
# Les valeurs générées sont gardées dans ~/sharedmoodle-secrets.txt (lisible
# par toi seul) pour pouvoir se connecter à Moodle en cas de besoin. Ne pas le commiter.
#
# Attention : MariaDB et PostgreSQL ne lisent le mot de passe qu'à la création
# de leur volume. Si les volumes existent déjà avec les anciens mots de passe,
# il faut les supprimer (données perdues) ou donner l'ancienne valeur :
#   SM_POSTGRES_PASSWORD=... ./scripts/create-secrets.sh
# Ne jamais changer sm_tenant_master_key une fois des établissements créés :
# le mot de passe de leur base en dépend.

set -euo pipefail

MANAGER="${MANAGER:-manager1}"
OUT="${HOME}/sharedmoodle-secrets.txt"
# Les secrets de chaque établissement (sm-<slug>_*) sont créés par le provisioner.
# sm_grafana_admin_password : compte "admin" de Grafana (http://grafana.sharedmoodle)
SECRETS=(sm_postgres_password sm_jwt_secret sm_provisioner_token sm_tenant_master_key sm_grafana_admin_password)

umask 077
touch "$OUT"

for name in "${SECRETS[@]}"; do
  if docker exec "$MANAGER" docker secret inspect "$name" >/dev/null 2>&1; then
    echo "existe déjà : $name"
    continue
  fi
  # Valeur fournie par variable d'environnement (ex. SM_POSTGRES_PASSWORD), sinon aléatoire
  var="$(echo "$name" | tr '[:lower:]' '[:upper:]')"
  value="${!var:-$(openssl rand -hex 16)}"
  printf '%s' "$value" | docker exec -i "$MANAGER" docker secret create "$name" - >/dev/null
  echo "$name=$value" >> "$OUT"
  echo "créé : $name"
done

echo "Valeurs enregistrées dans $OUT"
docker exec "$MANAGER" docker secret ls
