#!/usr/bin/env bash
# -----------------------------------------------------------------------
# Run ON the VPS after copying a git bundle from your laptop, OR after
# `git pull` from GitHub when the network from the dev machine works.
#
# Bundle path (optional): first argument, default /root/moodbeats-main.bundle
#
#   scp /tmp/moodbeats-main.bundle root@148.135.138.197:/root/
#   ssh root@148.135.138.197 'bash -s' < scripts/vps-pull-bundle-rebuild.sh
#   # or on VPS:
#   bash scripts/vps-pull-bundle-rebuild.sh /root/moodbeats-main.bundle
# -----------------------------------------------------------------------
set -euo pipefail

REPO="${MOODBEATS_DIR:-/moodbeats}"
BUNDLE="${1:-/root/moodbeats-main.bundle}"

if [[ ! -d "${REPO}/.git" ]]; then
  REPO="/opt/moodbeats"
fi

cd "${REPO}"

if [[ -f "${BUNDLE}" ]]; then
  echo "==> Merging bundle ${BUNDLE} into ${REPO}"
  git pull "${BUNDLE}" main
else
  echo "==> No bundle at ${BUNDLE}; trying git pull origin"
  git pull origin main
fi

echo "==> Rebuilding stack..."
export DOCKER_BUILDKIT=1
docker compose up -d --build

echo "==> Done. Check: curl -sf http://127.0.0.1:8001/api/health"
