#!/usr/bin/env bash
# -----------------------------------------------------------------------
# Local helper — push local changes and redeploy on the VPS.
# Run from your local machine (NOT on the VPS).
#
# Usage:
#   bash scripts/vps-deploy.sh [vps_user@vps_host] [public_hostname] [remote_dir]
#
# Defaults:
#   VPS_HOST = root@148.135.138.197
#   PUBLIC_HOST = 148.135.138.197.nip.io
#   REMOTE_DIR  = /opt/moodbeats
# -----------------------------------------------------------------------

set -euo pipefail

VPS_HOST="${1:-root@148.135.138.197}"
PUBLIC_HOST="${2:-148.135.138.197.nip.io}"
REMOTE_DIR="${3:-/opt/moodbeats}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Pushing local changes to GitHub..."
cd "${ROOT}"
git add -A
git diff --cached --quiet || git commit -m "chore: vps-deploy checkpoint $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git push

echo ""
echo "==> Deploying on ${VPS_HOST}..."
ssh "${VPS_HOST}" bash -s <<REMOTE_SCRIPT
  set -euo pipefail
  if [[ ! -d "${REMOTE_DIR}/.git" ]]; then
    echo "Cloning repo into ${REMOTE_DIR}..."
    git clone https://github.com/$(git remote get-url origin 2>/dev/null | sed 's|.*github.com[:/]||;s|\.git$||') "${REMOTE_DIR}"
  else
    echo "Pulling latest changes in ${REMOTE_DIR}..."
    cd "${REMOTE_DIR}"
    git pull
  fi
  cd "${REMOTE_DIR}"
  bash scripts/debian-vps-bootstrap.sh "${PUBLIC_HOST}" "${REMOTE_DIR}"
REMOTE_SCRIPT

echo ""
echo "==> Done. Site: https://${PUBLIC_HOST}"
