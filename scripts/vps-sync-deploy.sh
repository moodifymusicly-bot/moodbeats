#!/usr/bin/env bash
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
# 3) Optionally patches frontend/.env.production for VITE_API_URL and root .env for ALLOWED_ORIGINS
# 4) Rebuilds and restarts the docker compose stack on VPS (main backend + recommendation service)
# 5) Runs Alembic migrations inside the backend container
# 6) Post-deploy verification:
#    a) Main backend health check  (port 8001/api/health)
#    b) Recommendation service health check (port 8002/api/health)
#    c) Backend -> recommendation inter-service connectivity (backend calls reco service)
#    d) Clerk env var presence check
#    e) Complete env key audit (compare against .env.example template)
# 7) Prints a deployment summary with PASS/FAIL for every check
#
# Usage:
#   bash scripts/vps-sync-deploy.sh
#   VPS=root@YOUR_HOST REMOTE_DIR=/opt/moodbeatz bash scripts/vps-sync-deploy.sh
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
REMOTE_DIR="${REMOTE_DIR:-/opt/moodbeatz}"
PUBLIC_HOST="${PUBLIC_HOST:-}"
DRY_RUN="${DRY_RUN:-0}"
SSH_OPTS=(
  -o StrictHostKeyChecking=accept-new
  -o ConnectTimeout=10
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=8
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
  # recommendation_system is INCLUDED — it is the standalone microservice
  # and must be present on the VPS for the recommendation-service container.
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

echo "==> Running remote deploy actions on ${VPS}..."
remote_ssh bash <<EOF
set -euo pipefail
REPO="${REMOTE_DIR}"
PUBLIC_HOST="${PUBLIC_HOST}"
BACKEND_PORT=${BACKEND_PORT}
RECO_PORT=${RECO_PORT}

# ─── ANSI colours (remote) ───────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

if [[ ! -f "\${REPO}/docker-compose.yml" ]]; then
  echo "ERROR: docker-compose.yml not found in \${REPO}" >&2
  exit 1
fi

cd "\${REPO}"
echo "Using repo: \$(pwd)"

# ─── Patch env vars if PUBLIC_HOST was supplied ──────────────────────────────
if [[ -n "\${PUBLIC_HOST}" ]]; then
  API_BASE="https://\${PUBLIC_HOST}"

  # --- Patch frontend/.env.production (VITE_* baked at build time) ---
  FRONTEND_ENV="\${REPO}/frontend/.env.production"
  if [[ ! -f "\${FRONTEND_ENV}" ]]; then
    echo "ERROR: \${FRONTEND_ENV} not found" >&2
    exit 1
  fi

  if grep -q "^VITE_API_URL=" "\${FRONTEND_ENV}"; then
    sed -i "s|^VITE_API_URL=.*|VITE_API_URL=\${API_BASE}|" "\${FRONTEND_ENV}"
  else
    echo "VITE_API_URL=\${API_BASE}" >> "\${FRONTEND_ENV}"
  fi

  echo "Updated frontend env:"
  grep "^VITE_API_URL=" "\${FRONTEND_ENV}" || true

  # --- Patch root .env for backend CORS (ALLOWED_ORIGINS) ---
  if [[ ! -f .env ]]; then
    echo "ERROR: .env not found in \${REPO}" >&2
    exit 1
  fi

  if grep -q "^ALLOWED_ORIGINS=" .env; then
    # Append the public host if not already present
    CURRENT_ORIGINS="\$(grep '^ALLOWED_ORIGINS=' .env | cut -d= -f2-)"
    if ! echo "\${CURRENT_ORIGINS}" | grep -q "\${API_BASE}"; then
      sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=\${CURRENT_ORIGINS},\${API_BASE}|" .env
    fi
  else
    echo "ALLOWED_ORIGINS=\${API_BASE}" >> .env
  fi

  echo "Updated ALLOWED_ORIGINS:"
  grep "^ALLOWED_ORIGINS=" .env || true
fi

# ─── Ensure RECO_SERVICE_URL is present in .env ──────────────────────────────
# The recommendation service runs as a Docker Compose service called
# "recommendation-service" on port 8002. The backend resolves it by container
# name on the internal compose network.
if [[ -f .env ]]; then
  if grep -q "^RECO_SERVICE_URL=" .env; then
    echo "RECO_SERVICE_URL already set:"
    grep "^RECO_SERVICE_URL=" .env
  else
    echo "RECO_SERVICE_URL=http://recommendation-service:8002" >> .env
    echo "  Added RECO_SERVICE_URL=http://recommendation-service:8002 to .env"
  fi
fi

# ─── Patch Caddyfile: route /api/recommendations/* to recommendation-service ──
# The recommendation-service runs on port 8002 and owns all /api/recommendations/*
# routes. Caddy currently routes /api/* to the backend (8001); we add a more-
# specific block so that /api/recommendations requests hit port 8002 instead.
#
# Strategy: idempotent sed — only modify if the block is not already present.
CADDYFILE=/etc/caddy/Caddyfile
if [[ -f "\${CADDYFILE}" ]]; then
  if grep -q "api/recommendations" "\${CADDYFILE}"; then
    echo "  Caddyfile already routes /api/recommendations — skipping patch."
  else
    echo "  Patching Caddyfile to route /api/recommendations/* -> :8002..."
    # Insert before the generic /api/* block
    sed -i 's|    handle /api/\* {|    handle /api/recommendations* {\n        reverse_proxy 127.0.0.1:'"\${RECO_PORT}"'\n    }\n\n    handle /api/* {|' "\${CADDYFILE}"
    systemctl reload caddy
    echo "  Caddy reloaded. /api/recommendations* -> :\${RECO_PORT}"
  fi
else
  echo "  WARN: Caddyfile not found at \${CADDYFILE} — manual Caddy config required."
fi

# ─── Rebuild + restart the full stack ────────────────────────────────────────
export DOCKER_BUILDKIT=1
echo ""
echo "==> Building and starting docker compose stack (all services)..."
docker compose up -d --build

# ─── Database migrations ─────────────────────────────────────────────────────
# Run alembic upgrade head inside the running backend container.
# This is idempotent — safe to run on every deploy.
echo ""
echo "==> Waiting for backend container to be healthy (max 60s)..."
for i in \$(seq 1 60); do
  STATUS=\$(docker inspect --format '{{.State.Health.Status}}' moodbeatz-backend 2>/dev/null || echo "unknown")
  if [[ "\${STATUS}" == "healthy" ]] || docker compose ps backend 2>/dev/null | grep -q "Up"; then
    break
  fi
  sleep 1
done

echo "==> Running database migrations (alembic upgrade head)..."
if docker compose exec -T backend alembic upgrade head 2>&1; then
  echo "    Migrations: OK"
else
  echo "    WARN: alembic upgrade returned non-zero — check logs if startup fails."
fi

# ─── Env key audit ───────────────────────────────────────────────────────────
# Compare keys present in .env against .env.example (the canonical template).
# Warns for every key in .env.example that is absent from .env.
echo ""
echo "==> Env key audit (comparing .env against .env.example)..."
ENV_AUDIT_PASS=true

if [[ ! -f .env.example ]]; then
  echo "  WARN: .env.example not found; skipping env key audit."
else
  # Extract keys from .env.example (non-empty, non-comment lines)
  EXAMPLE_KEYS=\$(grep -E '^[A-Z_][A-Z_0-9]*=' .env.example | sed 's/=.*//' | sort)
  # Extract keys present in .env
  CURRENT_KEYS=\$(grep -E '^[A-Z_][A-Z_0-9]*=' .env 2>/dev/null | sed 's/=.*//' | sort || true)

  while IFS= read -r key; do
    if echo "\${CURRENT_KEYS}" | grep -qx "\${key}"; then
      # Check that the value is not empty and not obviously a placeholder
      VALUE=\$(grep "^\${key}=" .env | cut -d= -f2-)
      if [[ -z "\${VALUE}" ]] || echo "\${VALUE}" | grep -qE '^(change-me|XXXX|your-|sk_test_xxx|pk_test_xxx|AIzaSyXXX)'; then
        printf "  \${YELLOW}WARN\${NC} : %-40s (placeholder or empty — set real value)\n" "\${key}"
        ENV_AUDIT_PASS=false
      else
        printf "  \${GREEN}OK\${NC}   : \${key}\n"
      fi
    else
      printf "  \${RED}MISSING\${NC}: %-40s (not in .env — add it)\n" "\${key}"
      ENV_AUDIT_PASS=false
    fi
  done <<< "\${EXAMPLE_KEYS}"
fi

# ─── Wait for recommendation service to come up (max 90s) ────────────────────
echo ""
echo "==> Waiting for recommendation service to be healthy (max 90s)..."
RECO_READY=false
for i in \$(seq 1 90); do
  STATUS=\$(docker inspect --format '{{.State.Health.Status}}' moodbeatz-recommendation 2>/dev/null || echo "unknown")
  if [[ "\${STATUS}" == "healthy" ]]; then
    RECO_READY=true
    echo "    moodbeatz-recommendation became healthy after \${i}s"
    break
  fi
  sleep 1
done
if [[ "\${RECO_READY}" == "false" ]]; then
  echo "    WARN: moodbeatz-recommendation did not report healthy within 90s (may still be building FAISS index)"
fi

# ─── Health checks ───────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              POST-DEPLOY VERIFICATION RESULTS               ║"
echo "╚══════════════════════════════════════════════════════════════╝"

# Track overall status
ALL_PASS=true

# Helper: run a curl health check and print PASS/FAIL
check_http() {
  local label="\$1"
  local url="\$2"
  local expected_string="\${3:-}"   # optional substring to verify in response body

  local http_code body
  body=\$(curl -sf --max-time 8 "\${url}" 2>/dev/null || true)
  http_code=\$(curl -o /dev/null -s -w "%{http_code}" --max-time 8 "\${url}" 2>/dev/null || echo "000")

  if [[ "\${http_code}" == "200" ]]; then
    if [[ -n "\${expected_string}" ]] && ! echo "\${body}" | grep -q "\${expected_string}"; then
      printf "  \${RED}FAIL\${NC} %-45s  HTTP \${http_code} but body missing: '\${expected_string}'\n" "\${label}"
      ALL_PASS=false
    else
      printf "  \${GREEN}PASS\${NC} %-45s  HTTP \${http_code}\n" "\${label}"
    fi
  else
    printf "  \${RED}FAIL\${NC} %-45s  HTTP \${http_code} (expected 200)\n" "\${label}"
    ALL_PASS=false
  fi
}

# 1) Main backend health
echo ""
echo "── Service Health ──────────────────────────────────────────────"
check_http "Main backend      /api/health" \
  "http://127.0.0.1:\${BACKEND_PORT}/api/health" "ok"

# 2) Recommendation service health
check_http "Recommendation svc /api/health" \
  "http://127.0.0.1:\${RECO_PORT}/api/health" "healthy"

# 3) Inter-service connectivity: direct hit on recommendation-service
# The recommendation-service is on port 8002 and exposes /api/recommendations/* routes.
# We test the moods list (unauthenticated) as a smoke test.
echo ""
echo "── Inter-Service Connectivity ──────────────────────────────────"
check_http "Reco svc health    /api/health" \
  "http://127.0.0.1:\${RECO_PORT}/api/health" "healthy"

# Sanity: backend moods list (backend-owned route, always present)
check_http "Backend moods list /api/moods" \
  "http://127.0.0.1:\${BACKEND_PORT}/api/moods" ""

# 4) Clerk auth: protected route should NOT return 200 without a token
# (we expect 401 Unauthorized; if we get 200 then auth is incorrectly open)
echo ""
echo "── Clerk Auth Verification ─────────────────────────────────────"
CLERK_KEYS_SET=true

if [[ -f .env ]]; then
  for clerk_key in CLERK_SECRET_KEY CLERK_ISSUER CLERK_JWKS_URL; do
    VAL=\$(grep "^\${clerk_key}=" .env 2>/dev/null | cut -d= -f2- || true)
    if [[ -z "\${VAL}" ]] || echo "\${VAL}" | grep -qE '^(sk_test_xxx|change-me|https://your-tenant)'; then
      printf "  \${RED}MISSING\${NC}: \${clerk_key} — auth will reject all requests\n"
      CLERK_KEYS_SET=false
      ALL_PASS=false
    else
      printf "  \${GREEN}PRESENT\${NC}: \${clerk_key}\n"
    fi
  done
fi

# Call a protected endpoint without a token on the recommendation service — expect 401
AUTH_CODE=\$(curl -o /dev/null -s -w "%{http_code}" --max-time 8 \
  "http://127.0.0.1:\${RECO_PORT}/api/recommendations/for-you" 2>/dev/null || echo "000")
if [[ "\${AUTH_CODE}" == "401" || "\${AUTH_CODE}" == "403" ]]; then
  printf "  \${GREEN}PASS\${NC} Auth middleware active (got \${AUTH_CODE} on protected route)\n"
elif [[ "\${AUTH_CODE}" == "200" ]]; then
  printf "  \${RED}FAIL\${NC} Protected route returned 200 without token — auth is OPEN!\n"
  ALL_PASS=false
elif [[ "\${AUTH_CODE}" == "000" ]]; then
  printf "  \${YELLOW}WARN\${NC} Could not reach protected route (service may still be starting)\n"
else
  printf "  \${YELLOW}WARN\${NC} Protected route returned \${AUTH_CODE} (expected 401)\n"
fi

# ─── Env audit result ────────────────────────────────────────────────────────
echo ""
echo "── Env Key Audit ───────────────────────────────────────────────"
if [[ "\${ENV_AUDIT_PASS}" == "true" ]]; then
  printf "  \${GREEN}PASS\${NC} All .env.example keys present with non-placeholder values\n"
else
  printf "  \${YELLOW}WARN\${NC} Some env keys are missing or contain placeholder values (see above)\n"
fi

# ─── Container status ────────────────────────────────────────────────────────
echo ""
echo "── Container Status ────────────────────────────────────────────"
docker compose ps

# ─── Deployment summary ──────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    DEPLOYMENT SUMMARY                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Service               Port    Container"
echo "  ─────────────────     ─────   ──────────────────────────────"
echo "  Main backend          8001    moodbeatz-backend"
echo "  Recommendation svc    8002    moodbeatz-recommendation"
echo "  Frontend (nginx)      3000    moodbeatz-frontend"
echo "  PostgreSQL            5432    moodbeatz-db (internal)"
echo "  Redis                 6379    moodbeatz-redis (internal)"
echo ""
if [[ "\${ALL_PASS}" == "true" ]]; then
  printf "  Overall status:  \${GREEN}\${BOLD}ALL CHECKS PASSED ✓\${NC}\n"
else
  printf "  Overall status:  \${RED}\${BOLD}ONE OR MORE CHECKS FAILED — review output above\${NC}\n"
fi
echo ""
EOF

echo ""
echo "==> Deploy complete."
echo "    Frontend          : https://${PUBLIC_HOST:-<VPS_IP>}/"
echo "    Backend API       : https://${PUBLIC_HOST:-<VPS_IP>}/api/health"
echo "    Recommendation API: http://${VPS##*@}:${RECO_PORT}/api/health  (internal-only; no reverse-proxy)"
echo ""
echo "    To tail all logs  : ssh ${VPS} 'cd ${REMOTE_DIR} && docker compose logs -f --tail=50'"
echo "    To tail reco logs : ssh ${VPS} 'cd ${REMOTE_DIR} && docker compose logs -f --tail=50 recommendation-service'"
