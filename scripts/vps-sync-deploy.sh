#!/usr/bin/env bash
# ============================================================================
# Canonical MoodBeats local -> VPS deploy script (single source of truth)
#
# IMPORTANT AGENT POLICY (persistent process rule):
# - All automation and all agents must use THIS script for local-to-VPS deploys.
# - Do not add alternative deploy scripts that bypass this flow.
# - If deploy behavior must change, update this script in-place.
#
# What this script does:
# 1) Runs on this local machine (where the repo exists)
# 2) Syncs repository files to the VPS using rsync over SSH
# 3) Optionally patches VPS .env for public host settings
# 4) Rebuilds and restarts the docker compose stack on VPS
#
# Usage:
#   bash scripts/vps-sync-deploy.sh
#   VPS=root@YOUR_HOST REMOTE_DIR=/opt/moodbeats bash scripts/vps-sync-deploy.sh
#   PUBLIC_HOST=example.com bash scripts/vps-sync-deploy.sh
#   DRY_RUN=1 bash scripts/vps-sync-deploy.sh
#
# Required once:
# - Configure SSH key-based access (recommended):
#   bash scripts/vps-authorize-dev-machine-key.sh
#
# Persistence notes for team/agents:
# - Keep this script path stable: scripts/vps-sync-deploy.sh
# - Reference this path in docs, CI notes, and agent instructions.
# ============================================================================

set -euo pipefail

VPS="${VPS:-root@148.135.138.197}"
REMOTE_DIR="${REMOTE_DIR:-/opt/moodbeats}"
PUBLIC_HOST="${PUBLIC_HOST:-}"
DRY_RUN="${DRY_RUN:-0}"
SSH_OPTS=(
  -o StrictHostKeyChecking=accept-new
  -o ConnectTimeout=10
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=8
)

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

require_cmd() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "ERROR: missing required command: ${cmd}" >&2
    exit 1
  fi
}

remote_ssh() {
  ssh "${SSH_OPTS[@]}" "${VPS}" "$@"
}

echo "==> Preflight checks..."
require_cmd rsync
require_cmd ssh
require_cmd git

if [[ ! -d "${ROOT}/.git" ]]; then
  echo "ERROR: ${ROOT} is not a git repository root." >&2
  exit 1
fi

echo "==> Verifying SSH access to ${VPS}..."
if ! remote_ssh "echo connected >/dev/null"; then
  echo "ERROR: unable to connect to ${VPS} via SSH." >&2
  exit 1
fi

RSYNC_FLAGS=(-az --delete)
if [[ "${DRY_RUN}" == "1" ]]; then
  RSYNC_FLAGS+=(-n -v)
fi

EXCLUDES=(
  --exclude ".git/"
  --exclude ".cursor/"
  --exclude "node_modules/"
  --exclude "frontend/node_modules/"
  --exclude "frontend/.next/"
  --exclude "backend/.venv/"
  --exclude ".venv/"
  --exclude "__pycache__/"
  --exclude ".pytest_cache/"
  --exclude ".mypy_cache/"
  --exclude "releases/"
)

echo "==> Ensuring remote directory exists: ${REMOTE_DIR}"
remote_ssh "mkdir -p '${REMOTE_DIR}'"

echo "==> Syncing local repo to VPS via rsync..."
rsync "${RSYNC_FLAGS[@]}" \
  -e "ssh ${SSH_OPTS[*]}" \
  "${EXCLUDES[@]}" \
  "${ROOT}/" "${VPS}:${REMOTE_DIR}/"

if [[ "${DRY_RUN}" == "1" ]]; then
  echo "==> DRY_RUN=1 set; skipping remote deploy actions."
  exit 0
fi

echo "==> Running remote deploy actions on ${VPS}..."
remote_ssh bash <<EOF
set -euo pipefail
REPO="${REMOTE_DIR}"
PUBLIC_HOST="${PUBLIC_HOST}"

if [[ ! -f "\${REPO}/docker-compose.yml" ]]; then
  echo "ERROR: docker-compose.yml not found in \${REPO}" >&2
  exit 1
fi

cd "\${REPO}"
echo "Using repo: \$(pwd)"

if [[ -n "\${PUBLIC_HOST}" ]]; then
  API_BASE="https://\${PUBLIC_HOST}"
  if [[ ! -f .env ]]; then
    echo "ERROR: .env not found in \${REPO}" >&2
    exit 1
  fi

  if grep -q "^NEXT_PUBLIC_API_URL=" .env; then
    sed -i "s|^NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=\${API_BASE}|" .env
  else
    echo "NEXT_PUBLIC_API_URL=\${API_BASE}" >> .env
  fi

  if grep -q "^ALLOWED_ORIGINS=" .env; then
    sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=\${API_BASE}|" .env
  else
    echo "ALLOWED_ORIGINS=\${API_BASE}" >> .env
  fi

  echo "Updated public env values:"
  grep -E "^NEXT_PUBLIC_API_URL=|^ALLOWED_ORIGINS=" .env || true
fi

export DOCKER_BUILDKIT=1
docker compose up -d --build

echo "Backend health:"
curl -sf http://127.0.0.1:8001/api/health && echo " OK" || echo " WARN: health check failed"
EOF

echo "==> Deploy complete."
