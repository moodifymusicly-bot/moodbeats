#!/usr/bin/env bash
# Run on your dev machine (where this repo lives). Uses scp + ssh — you will
# be prompted for the VPS root password unless key-based auth works.
#
# Usage:
#   bash scripts/deploy-vps-from-dev.sh
#   VPS=root@YOUR_HOST REMOTE_DIR=/moodbeats bash scripts/deploy-vps-from-dev.sh
#
# Optional: install `sshpass` and export MOODBEATS_SSH_PASSWORD for non-interactive use
# (not recommended; prefer SSH keys — see scripts/vps-authorize-dev-machine-key.sh).

set -euo pipefail

VPS="${VPS:-root@148.135.138.197}"
REMOTE_DIR="${REMOTE_DIR:-/moodbeats}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE="${ROOT}/releases/moodbeats-deploy.bundle"

cd "${ROOT}"
mkdir -p releases
echo "==> Creating git bundle from main..."
git bundle create "${BUNDLE}" main

remote_scp() {
  if [[ -n "${MOODBEATS_SSH_PASSWORD:-}" ]] && command -v sshpass >/dev/null 2>&1; then
    sshpass -e scp -o StrictHostKeyChecking=accept-new "${BUNDLE}" "${VPS}:/root/moodbeats-deploy.bundle"
  else
    scp -o StrictHostKeyChecking=accept-new "${BUNDLE}" "${VPS}:/root/moodbeats-deploy.bundle"
  fi
}

remote_ssh() {
  if [[ -n "${MOODBEATS_SSH_PASSWORD:-}" ]] && command -v sshpass >/dev/null 2>&1; then
    sshpass -e ssh -o StrictHostKeyChecking=accept-new "${VPS}" "$@"
  else
    ssh -o StrictHostKeyChecking=accept-new "${VPS}" "$@"
  fi
}

echo "==> Uploading bundle to ${VPS}..."
remote_scp

echo "==> Merging bundle and rebuilding Docker stack on VPS..."
remote_ssh bash <<EOF
set -euo pipefail
REPO=${REMOTE_DIR}
if [[ ! -d "\$REPO/.git" ]]; then
  REPO=/opt/moodbeats
fi
cd "\$REPO"
echo "Using repo: \$(pwd)"
git pull /root/moodbeats-deploy.bundle main
export DOCKER_BUILDKIT=1
docker compose up -d --build
curl -sf http://127.0.0.1:8001/api/health && echo " (backend health OK)" || echo "WARN: health check failed"
docker compose exec -T backend alembic current 2>/dev/null || true
EOF

echo "==> Done."
