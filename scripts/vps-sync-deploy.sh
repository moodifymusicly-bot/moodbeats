#!/usr/bin/env bash

echo -e "\033[0;31mWARNING: This script is deprecated! Please use the root deploy.sh script instead.\033[0m"
sleep 2

# ============================================================================
# Canonical MoodBeatz local -> VPS deploy script (single source of truth)
#
# IMPORTANT AGENT POLICY (persistent process rule):
# - All automation and all agents must use THIS script for local-to-VPS deploys.
# - Do not add alternative deploy scripts that bypass this flow.
# - If deploy behavior must change, update this script in-place.
#
# What this script does:
# 1) Runs on this local machine (where the repo exists)
# 2) Syncs repository files to the VPS using rsync over SSH
# 3) Patches frontend/.env.production for VITE_API_URL and root .env for ALLOWED_ORIGINS
# 4) Updates Python venvs, rebuilds frontend, runs alembic migrations
# 5) Restarts services via supervisorctl (native deploy, no Docker)
# 6) Post-deploy verification:
#    a) Main backend health check (port 8001/api/health)
#    b) Recommendation service health check (port 8002/api/health)
#    c) Backend moods route (connectivity)
#    d) Clerk env var presence check
#    e) Auth middleware smoke test
# 7) Prints a deployment summary with PASS/FAIL for every check
#
# Usage:
#   bash scripts/vps-sync-deploy.sh
#   VPS=root@YOUR_HOST REMOTE_DIR=/opt/moodbeatz bash scripts/vps-sync-deploy.sh
#   PUBLIC_HOST=example.com bash scripts/vps-sync-deploy.sh
#   DRY_RUN=1 bash scripts/vps-sync-deploy.sh
#
# Required once:
# - Run vps-native-bootstrap.sh on the VPS to install PostgreSQL, Redis,
#   Python venvs, Caddy, and supervisord config.
# - Configure SSH key-based access (recommended):
#   bash scripts/vps-authorize-dev-machine-key.sh
#
# Persistence notes for team/agents:
# - Keep this script path stable: scripts/vps-sync-deploy.sh
# - Reference this path in docs, CI notes, and agent instructions.
# ============================================================================

set -euo pipefail

VPS="${VPS:-root@187.127.181.204}"
SSH_PORT="${SSH_PORT:-22}"
REMOTE_DIR="${REMOTE_DIR:-/opt/moodbeatz}"
PUBLIC_HOST="${PUBLIC_HOST:-187.127.181.204.nip.io}"
DRY_RUN="${DRY_RUN:-0}"

# ─── SSH ControlMaster multiplexing ──────────────────────────────────────────
# Reuse a single authenticated SSH connection for the entire deploy session.
# This means you only enter a password ONCE (or zero times with key-based auth).
SSH_CONTROL_DIR="${TMPDIR:-/tmp}/moodbeatz-ssh-$$"
mkdir -p "${SSH_CONTROL_DIR}"
SSH_CONTROL_PATH="${SSH_CONTROL_DIR}/ctrl-%C"

cleanup_ssh_mux() {
  ssh -o ControlPath="${SSH_CONTROL_PATH}" -O exit "${VPS}" 2>/dev/null || true
  rm -rf "${SSH_CONTROL_DIR}"
}
trap cleanup_ssh_mux EXIT

SSH_OPTS=(
  -p "${SSH_PORT}"
  -o StrictHostKeyChecking=accept-new
  -o ConnectTimeout=10
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=8
  -o ControlMaster=auto
  -o ControlPath="${SSH_CONTROL_PATH}"
  -o ControlPersist=300
)

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ─── Ports used by each service ─────────────────────────────────────────────
BACKEND_PORT=8001
RECO_PORT=8002

# ─── ANSI colours ────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'  # No Colour

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

echo "==> Verifying SSH access to ${VPS} (port ${SSH_PORT})..."
echo "    (if prompted for a password, consider running: bash scripts/vps-authorize-dev-machine-key.sh)"
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
  --exclude ".gemini/"
  --exclude "node_modules/"
  --exclude "frontend/node_modules/"
  --exclude "frontend/.next/"
  --exclude "frontend/dist/"
  # Exclude ALL Python virtual environments (both naming conventions)
  --exclude "backend/venv/"
  --exclude "backend/.venv/"
  --exclude "recommendation_system/.venv/"
  --exclude ".venv/"
  --exclude "venv/"
  --exclude "__pycache__/"
  --exclude "*.pyc"
  --exclude "*.pyo"
  --exclude ".pytest_cache/"
  --exclude ".mypy_cache/"
  --exclude "releases/"
  --exclude "UINew_backup/"
  # recommendation_system is INCLUDED — it is the standalone microservice
)

echo "==> Ensuring remote directory exists: ${REMOTE_DIR}"
remote_ssh "mkdir -p '${REMOTE_DIR}'"

echo "==> Syncing local repo to VPS via rsync..."
echo "    (includes recommendation_system/ for the standalone service)"
rsync "${RSYNC_FLAGS[@]}" \
  -e "ssh ${SSH_OPTS[*]}" \
  "${EXCLUDES[@]}" \
  "${ROOT}/" "${VPS}:${REMOTE_DIR}/"

if [[ "${DRY_RUN}" == "1" ]]; then
  echo "==> DRY_RUN=1 set; skipping remote deploy actions."
  exit 0
fi

# ─── Create the remote deploy script ────────────────────────────────────────
# We write a script file to the VPS and execute it, avoiding heredoc escaping
# issues entirely.
REMOTE_SCRIPT="${REMOTE_DIR}/.deploy-actions.sh"

remote_ssh "cat > '${REMOTE_SCRIPT}'" <<'REMOTE_EOF'
#!/usr/bin/env bash
set -euo pipefail

REPO="$1"
PUBLIC_HOST="$2"
BACKEND_PORT="$3"
RECO_PORT="$4"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

cd "${REPO}"
echo "Using repo: $(pwd)"

# ─── Patch env vars if PUBLIC_HOST was supplied ──────────────────────────────
if [[ -n "${PUBLIC_HOST}" ]]; then
  API_BASE="https://${PUBLIC_HOST}"

  FRONTEND_ENV="${REPO}/frontend/.env.production"
  [[ -f "${FRONTEND_ENV}" ]] || { echo "ERROR: ${FRONTEND_ENV} not found" >&2; exit 1; }

  if grep -q "^VITE_API_URL=" "${FRONTEND_ENV}"; then
    sed -i "s|^VITE_API_URL=.*|VITE_API_URL=${API_BASE}|" "${FRONTEND_ENV}"
  else
    echo "VITE_API_URL=${API_BASE}" >> "${FRONTEND_ENV}"
  fi
  echo "Updated frontend env:"
  grep "^VITE_API_URL=" "${FRONTEND_ENV}" || true

  [[ -f .env ]] || { echo "ERROR: .env not found in ${REPO}" >&2; exit 1; }

  if grep -q "^ALLOWED_ORIGINS=" .env; then
    CURRENT_ORIGINS="$(grep '^ALLOWED_ORIGINS=' .env | cut -d= -f2-)"
    if ! echo "${CURRENT_ORIGINS}" | grep -q "${API_BASE}"; then
      sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=${CURRENT_ORIGINS},${API_BASE}|" .env
    fi
  else
    echo "ALLOWED_ORIGINS=${API_BASE}" >> .env
  fi
  echo "Updated ALLOWED_ORIGINS:"
  grep "^ALLOWED_ORIGINS=" .env || true
fi

# ─── Ensure .env.native exists ───────────────────────────────────────────────
if [[ ! -f .env.native ]]; then
  echo "  Creating .env.native (native deploy overrides)..."
  set -a; source .env; set +a
  PG_USER="${POSTGRES_USER:-moodmusic}"
  PG_PASS="${POSTGRES_PASSWORD:-moodmusic_secret}"
  PG_DB="${POSTGRES_DB:-moodmusic}"
  REDIS_PASS="${REDIS_PASSWORD:-change-me-redis-password}"
  cat > .env.native <<NEOF
DATABASE_URL=postgresql+asyncpg://${PG_USER}:${PG_PASS}@127.0.0.1:5432/${PG_DB}
REDIS_URL=redis://:${REDIS_PASS}@127.0.0.1:6379/0
RECO_SERVICE_URL=http://127.0.0.1:8002
ENVIRONMENT=production
CACHE_ENABLED=true
RUN_MIGRATIONS_ON_STARTUP=true
FAISS_ENABLED=true
FAISS_INDEX_PATH=/var/moodbeatz/faiss/songs
FAISS_MIN_CATALOG_SIZE=50
NEOF
fi

# Load merged environment
set -a
source .env
source .env.native
set +a

# ─── Update Python dependencies ─────────────────────────────────────────────
echo ""
echo "==> Updating Python dependencies..."

if [[ -x /opt/miniconda/envs/py311/bin/python ]]; then
  PYTHON_BIN="/opt/miniconda/envs/py311/bin/python"
else
  PYTHON_BIN="python3.11"
fi

setup_venv() {
  local dir="$1"
  local venv_dir="${dir}/.venv"
  
  if [[ -d "${venv_dir}" ]]; then
    local venv_py_ver=$("${venv_dir}/bin/python" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null || echo "0.0")
    if [[ "${venv_py_ver}" != "3.11" ]]; then
      echo "    WARN: ${venv_dir} is Python ${venv_py_ver}. Removing to recreate with Python 3.11..."
      rm -rf "${venv_dir}"
    fi
  fi

  if [[ ! -d "${venv_dir}" ]]; then
    echo "    Creating Python 3.11 venv at ${venv_dir}..."
    "${PYTHON_BIN}" -m venv "${venv_dir}"
  fi

  "${venv_dir}/bin/pip" install --quiet --upgrade pip
  "${venv_dir}/bin/pip" install --quiet -r "${dir}/requirements.txt"
}

setup_venv "${REPO}/backend"
echo "    Backend deps: OK"

setup_venv "${REPO}/recommendation_system"
echo "    Recommendation deps: OK"

# ─── Rebuild frontend ───────────────────────────────────────────────────────
echo ""
echo "==> Building frontend..."
cd "${REPO}/frontend"
npm ci --silent 2>/dev/null || npm install --silent
npm run build
echo "    Frontend build: OK"
cd "${REPO}"

# ─── Update Caddy config ────────────────────────────────────────────────────
CADDYFILE=/etc/caddy/Caddyfile
if [[ ! -f "${CADDYFILE}" ]]; then
  echo "  Creating default Caddyfile..."
  mkdir -p /etc/caddy
  cat > "${CADDYFILE}" <<CEOF
${PUBLIC_HOST} {
    encode zstd gzip
    handle /api/recommendations* {
        reverse_proxy 127.0.0.1:${RECO_PORT}
    }
    handle /api/* {
        reverse_proxy 127.0.0.1:${BACKEND_PORT}
    }
    handle {
        root * ${REPO}/frontend/dist
        try_files {path} /index.html
        file_server
    }
}
CEOF
  echo "    Caddyfile created"
else
  echo "    Caddyfile already exists"
  if [[ -n "${PUBLIC_HOST}" ]] && ! grep -q -E "(^| |,)${PUBLIC_HOST}( |,|{)" "${CADDYFILE}"; then
    echo "    Injecting ${PUBLIC_HOST} into existing Caddyfile..."
    sed -i "1s/{/, ${PUBLIC_HOST} {/" "${CADDYFILE}"
  fi
fi

# ─── Database migrations ────────────────────────────────────────────────────
echo ""
echo "==> Running database migrations (alembic upgrade head)..."
cd "${REPO}/backend"
if "${REPO}/backend/.venv/bin/python" -m alembic upgrade head 2>&1; then
  echo "    Migrations: OK"
else
  echo "    WARN: alembic upgrade returned non-zero — check logs"
fi
cd "${REPO}"

# ─── Sync Supervisor Environment ──────────────────────────────────────────────
echo ""
echo "==> Syncing supervisor environment variables..."
build_env_line() {
  local env_str=""
  while IFS='=' read -r key value; do
    [[ -z "${key}" || "${key}" =~ ^# ]] && continue
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
    if [[ -n "${env_str}" ]]; then
      env_str="${env_str},${key}=\"${value}\""
    else
      env_str="${key}=\"${value}\""
    fi
  done < <(cat "${REPO}/.env" "${REPO}/.env.native" 2>/dev/null | grep -v '^#' | grep -v '^$')
  echo "${env_str}"
}
SUP_ENV=$(build_env_line)

for conf_file in /etc/supervisor/conf.d/moodbeatz.conf /etc/supervisor.d/moodbeatz.ini; do
  if [[ -f "${conf_file}" ]]; then
    sed -i "s|^environment=.*|environment=${SUP_ENV}|" "${conf_file}"
    echo "    Updated ${conf_file}"
  fi
done

# ─── Restart services via supervisor ─────────────────────────────────────────
echo ""
echo "==> Restarting services via supervisorctl/systemctl..."
if command -v supervisorctl &>/dev/null; then
  supervisorctl reread 2>/dev/null || true
  supervisorctl update 2>/dev/null || true
  supervisorctl restart moodbeatz-backend moodbeatz-recommendation 2>/dev/null || true
  supervisorctl restart caddy 2>/dev/null || true
fi

if command -v systemctl &>/dev/null; then
  systemctl restart caddy 2>/dev/null || true
  systemctl restart valkey 2>/dev/null || true
fi

echo "    Waiting for services to start..."
sleep 10
echo "    Services restarted"

# ─── Health checks ───────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              POST-DEPLOY VERIFICATION RESULTS               ║"
echo "╚══════════════════════════════════════════════════════════════╝"

ALL_PASS=true

check_http() {
  local label="$1"
  local url="$2"
  local expected_string="${3:-}"
  local http_code body
  body=$(curl -sf --max-time 8 "${url}" 2>/dev/null || true)
  http_code=$(curl -o /dev/null -s -w "%{http_code}" --max-time 8 "${url}" 2>/dev/null || echo "000")
  if [[ "${http_code}" == "200" ]]; then
    if [[ -n "${expected_string}" ]] && ! echo "${body}" | grep -q "${expected_string}"; then
      printf "  ${RED}FAIL${NC} %-45s  HTTP ${http_code} but missing: '${expected_string}'\n" "${label}"
      ALL_PASS=false
    else
      printf "  ${GREEN}PASS${NC} %-45s  HTTP ${http_code}\n" "${label}"
    fi
  else
    printf "  ${RED}FAIL${NC} %-45s  HTTP ${http_code} (expected 200)\n" "${label}"
    ALL_PASS=false
  fi
}

echo ""
echo "── Service Health ──────────────────────────────────────────────"
check_http "Main backend      /api/health" "http://127.0.0.1:${BACKEND_PORT}/api/health" "healthy"
check_http "Recommendation svc /api/health" "http://127.0.0.1:${RECO_PORT}/api/health" "healthy"

echo ""
echo "── Inter-Service Connectivity ──────────────────────────────────"
check_http "Backend moods list /api/moods" "http://127.0.0.1:${BACKEND_PORT}/api/moods" ""

echo ""
echo "── Clerk Auth Verification ─────────────────────────────────────"
for clerk_key in CLERK_SECRET_KEY CLERK_ISSUER CLERK_JWKS_URL; do
  VAL=$(grep "^${clerk_key}=" .env 2>/dev/null | cut -d= -f2- || true)
  if [[ -z "${VAL}" ]] || echo "${VAL}" | grep -qE '^(sk_test_xxx|change-me|https://your-tenant)'; then
    printf "  ${RED}MISSING${NC}: ${clerk_key}\n"
    ALL_PASS=false
  else
    printf "  ${GREEN}PRESENT${NC}: ${clerk_key}\n"
  fi
done

AUTH_CODE=$(curl -o /dev/null -s -w "%{http_code}" --max-time 8 \
  "http://127.0.0.1:${RECO_PORT}/api/recommendations/for-you" 2>/dev/null || echo "000")
if [[ "${AUTH_CODE}" == "401" || "${AUTH_CODE}" == "403" ]]; then
  printf "  ${GREEN}PASS${NC} Auth middleware active (got ${AUTH_CODE})\n"
elif [[ "${AUTH_CODE}" == "200" ]]; then
  printf "  ${RED}FAIL${NC} Protected route returned 200 without token — auth OPEN!\n"
  ALL_PASS=false
else
  printf "  ${YELLOW}WARN${NC} Protected route returned ${AUTH_CODE} (expected 401)\n"
fi

echo ""
echo "── Process Status ────────────────────────────────────────────"
supervisorctl status 2>/dev/null || echo "  supervisorctl not available"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    DEPLOYMENT SUMMARY                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Service               Port    Process"
echo "  ─────────────────     ─────   ──────────────────────────────"
echo "  Main backend          8001    gunicorn (supervisor)"
echo "  Recommendation svc    8002    gunicorn (supervisor)"
echo "  Frontend (Caddy)      443     caddy file_server"
echo "  PostgreSQL            5432    postgresql (supervisor)"
echo "  Redis                 6379    redis-server (supervisor)"
echo ""
if [[ "${ALL_PASS}" == "true" ]]; then
  printf "  Overall status:  ${GREEN}${BOLD}ALL CHECKS PASSED ✓${NC}\n"
else
  printf "  Overall status:  ${RED}${BOLD}ONE OR MORE CHECKS FAILED — review above${NC}\n"
fi
echo ""
REMOTE_EOF

echo "==> Running remote deploy actions on ${VPS}..."
remote_ssh "bash '${REMOTE_SCRIPT}' '${REMOTE_DIR}' '${PUBLIC_HOST}' '${BACKEND_PORT}' '${RECO_PORT}'"

echo ""
echo "==> Deploy complete."
echo "    Frontend          : https://${PUBLIC_HOST:-<VPS_IP>}/"
echo "    Backend API       : https://${PUBLIC_HOST:-<VPS_IP>}/api/health"
echo "    Recommendation API: http://${VPS##*@}:${RECO_PORT}/api/health  (internal-only)"
echo ""
echo "    To tail all logs  : ssh ${SSH_OPTS[*]} ${VPS} 'tail -f /var/log/moodbeatz/*.log'"
echo "    To check status   : ssh ${SSH_OPTS[*]} ${VPS} 'supervisorctl status'"
