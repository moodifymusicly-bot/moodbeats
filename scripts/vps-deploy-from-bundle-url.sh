#!/usr/bin/env bash
# Run ON THE VPS as root after the bundle is on disk (e.g. from tempfile.org).
# Usage:
#   curl -fsSL https://tempfile.org/FILEID/download -o /root/moodbeats-deploy.bundle
#   bash vps-deploy-from-bundle-url.sh
# Or with explicit paths:
#   BUNDLE=/root/moodbeats-deploy.bundle REPO=/moodbeats bash vps-deploy-from-bundle-url.sh

set -euo pipefail

BUNDLE="${BUNDLE:-/root/moodbeats-deploy.bundle}"
REPO="${REPO:-}"

if [[ ! -f "${BUNDLE}" ]]; then
  echo "Missing bundle: ${BUNDLE}" >&2
  exit 1
fi

if [[ -z "${REPO}" ]]; then
  for d in /moodbeats /opt/moodbeats; do
    if [[ -d "${d}/.git" ]]; then REPO="${d}"; break; fi
  done
fi

if [[ -z "${REPO}" || ! -d "${REPO}/.git" ]]; then
  echo "Could not find MoodBeats git repo (tried /moodbeats, /opt/moodbeats)." >&2
  exit 1
fi

cd "${REPO}"
echo "==> Repo: $(pwd)"
echo "==> Merging ${BUNDLE} into main..."
git pull "${BUNDLE}" main
export DOCKER_BUILDKIT=1
echo "==> docker compose up -d --build ..."
docker compose up -d --build
sleep 3
curl -sf "http://127.0.0.1:8001/api/health" && echo " (backend health OK)" || echo "WARN: health failed"
docker compose exec -T backend alembic current 2>/dev/null || true
echo "==> Done."
