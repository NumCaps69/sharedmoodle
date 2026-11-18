#!/usr/bin/env bash
# Publie une nouvelle version des images api, frontend, provisioner, prometheus et grafana.
#
#   ./scripts/release.sh 1.2.0             # construit en amd64, pousse :1.2.0 et :latest
#   DRY_RUN=1 ./scripts/release.sh 1.2.0   # met seulement les numéros à jour, sans construire
#
# Le script écrit la version dans :
#   - portal/backend/package.json (affichée par /api/health)
#   - portal/frontend/version.txt (servi sur /version.txt)
#   - docker-compose.yml (tags des images)
# Ensuite : commit, push, puis "docker stack deploy" sur la VM.
# Le Swarm met à jour une copie à la fois et revient en arrière seul si la
# nouvelle version échoue ; retour manuel : docker service rollback <service>.

set -euo pipefail

VERSION="${1:?Usage : $0 <version>, ex. 1.2.0}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Version invalide : $VERSION (format 1.2.0)"; exit 1; }

REPO="${REPO:-kasupremacy}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# 1. Numéros de version
(cd portal/backend && npm version "$VERSION" --no-git-tag-version --allow-same-version >/dev/null)
(cd portal/provisioner && npm version "$VERSION" --no-git-tag-version --allow-same-version >/dev/null)
printf '%s\n' "$VERSION" > portal/frontend/version.txt
sed -i.bak -E "s#(image: ${REPO}/sharedmoodle-(api|frontend|provisioner|prometheus|grafana)):[^[:space:]]+#\1:${VERSION}#" docker-compose.yml
rm -f docker-compose.yml.bak
echo "Version $VERSION écrite (package.json, version.txt, docker-compose.yml)"

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "DRY_RUN : images non construites"
  exit 0
fi

# 2. Images amd64 (la VM est en amd64, même depuis un Mac arm64)
for app in api frontend provisioner prometheus grafana; do
  case "$app" in
    api) dir="portal/backend" ;;
    prometheus|grafana) dir="monitoring/$app" ;;   # configuration intégrée à l'image
    *) dir="portal/$app" ;;
  esac
  docker buildx build --platform linux/amd64 \
    -t "${REPO}/sharedmoodle-${app}:${VERSION}" \
    -t "${REPO}/sharedmoodle-${app}:latest" \
    --push "$dir"
done

echo "Images publiées : ${REPO}/sharedmoodle-{api,frontend,provisioner,prometheus,grafana}:${VERSION}"
echo "Ensuite : git commit + push, puis sur la VM :"
echo "  docker exec -i manager1 docker stack deploy -c - sharedmoodle < ~/sharedmoodle/docker-compose.yml"
