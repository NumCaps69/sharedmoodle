#!/usr/bin/env bash
# Crée les Docker secrets de la pile SharedMoodle sur le manager Swarm.
# À lancer une seule fois sur la VM, avant "docker stack deploy".
#
#   ./scripts/create-secrets.sh            # valeurs aléatoires
#   MANAGER=manager1 ./scripts/create-secrets.sh
#
# Les valeurs générées sont gardées dans ~/sharedmoodle-secrets.txt (lisible
# par toi seul) pour pouvoir se connecter à Moodle en admin. Ne pas le commiter.
#
# Attention : MariaDB et PostgreSQL ne lisent le mot de passe qu'à la création
# de leur volume. Si les volumes existent déjà avec les anciens mots de passe,
# il faut les supprimer (données perdues) ou donner les anciennes valeurs :
#   SM_POSTGRES_PASSWORD=... SM_MOODLE_DB_PASSWORD=... ./scripts/create-secrets.sh

set -euo pipefail

MANAGER="${MANAGER:-manager1}"
OUT="${HOME}/sharedmoodle-secrets.txt"
SECRETS=(sm_postgres_password sm_jwt_secret sm_moodle_db_password sm_mariadb_root_password sm_moodle_admin_password)

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
