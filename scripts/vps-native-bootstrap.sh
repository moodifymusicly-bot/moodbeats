#!/usr/bin/env bash
# ============================================================================
# MoodBeatz Native VPS Bootstrap (no Docker)
#
# Installs PostgreSQL 15, Redis, Caddy, Python venvs, and configures
# supervisord to manage all services. Designed for containerised VPS
# environments (Modal, LXC) where Docker cannot run.
#
# Usage (run ON the VPS as root):
#   bash /opt/moodbeatz/scripts/vps-native-bootstrap.sh <public_hostname>
#
# Example:
#   bash /opt/moodbeatz/scripts/vps-native-bootstrap.sh moodbeatz.zocomputer.io
#
# Prerequisites:
#   - .env already written at MOODBEATZ_DIR/.env with real Clerk + YouTube keys
#   - Ports 80, 443, 8001, 8002 accessible
# ============================================================================

set -euo pipefail

PUBLIC_HOST="${1:?Usage: $0 <public_hostname>}"
MOODBEATZ_DIR="${2:-/opt/moodbeatz}"
API_BASE="https://${PUBLIC_HOST}"

# ─── ANSI colours ────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

step() { printf "\n${GREEN}${BOLD}==> %s${NC}\n" "$1"; }
warn() { printf "  ${YELLOW}WARN${NC}: %s\n" "$1"; }
fail() { printf "  ${RED}ERROR${NC}: %s\n" "$1" >&2; exit 1; }

# ─── Validate .env ──────────────────────────────────────────────────────────
if [[ ! -f "${MOODBEATZ_DIR}/.env" ]]; then
  fail ".env not found at ${MOODBEATZ_DIR}/.env. Copy it from your dev machine first."
fi

# Source .env for database credentials
set -a
# shellcheck disable=SC1091
source "${MOODBEATZ_DIR}/.env"
set +a

PG_USER="${POSTGRES_USER:-moodmusic}"
PG_PASS="${POSTGRES_PASSWORD:-moodmusic_secret}"
PG_DB="${POSTGRES_DB:-moodmusic}"
REDIS_PASS="${REDIS_PASSWORD:-change-me-redis-password}"

# ─── System packages ────────────────────────────────────────────────────────
step "Installing system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq

# PostgreSQL 15
if ! command -v psql &>/dev/null; then
  apt-get install -y -qq postgresql postgresql-client
  echo "  Installed PostgreSQL $(psql --version | awk '{print $3}')"
else
  echo "  PostgreSQL already installed: $(psql --version | awk '{print $3}')"
fi

# Redis
if ! command -v redis-server &>/dev/null; then
  apt-get install -y -qq redis-server
  echo "  Installed Redis $(redis-server --version | awk '{print $3}')"
else
  echo "  Redis already installed: $(redis-server --version | awk '{print $3}')"
fi

# Caddy (official apt repo)
if ! command -v caddy &>/dev/null; then
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy
  echo "  Installed Caddy $(caddy version 2>/dev/null || echo 'unknown')"
else
  echo "  Caddy already installed: $(caddy version 2>/dev/null || echo 'unknown')"
fi

# Build tools for Python C extensions
apt-get install -y -qq \
  build-essential libpq-dev libgl1 libglib2.0-0 \
  python3-venv python3-pip \
  supervisor \
  2>/dev/null || true

# ─── PostgreSQL setup ────────────────────────────────────────────────────────
step "Configuring PostgreSQL..."

# On container VPS, systemctl won't work. Start PostgreSQL directly.
PG_DATA="/var/lib/postgresql/15/main"
PG_CONF="/etc/postgresql/15/main"

# Detect installed PG version (may be 15 or 16 depending on Debian repos)
PG_VER=""
for v in 17 16 15 14; do
  if [[ -d "/etc/postgresql/${v}/main" ]]; then
    PG_VER="${v}"
    PG_DATA="/var/lib/postgresql/${PG_VER}/main"
    PG_CONF="/etc/postgresql/${PG_VER}/main"
    break
  fi
done

if [[ -z "${PG_VER}" ]]; then
  fail "PostgreSQL config directory not found. Check apt-get install output."
fi
echo "  PostgreSQL version: ${PG_VER}"

# Configure pg_hba.conf for password auth on localhost
if ! grep -q "^local.*${PG_DB}.*${PG_USER}.*md5" "${PG_CONF}/pg_hba.conf" 2>/dev/null; then
  # Add password auth line before the default "local all all peer" line
  sed -i "/^local.*all.*all.*peer/i local   ${PG_DB}   ${PG_USER}   md5" "${PG_CONF}/pg_hba.conf"
  # Also allow TCP connections
  if ! grep -q "^host.*${PG_DB}.*${PG_USER}.*127.0.0.1" "${PG_CONF}/pg_hba.conf" 2>/dev/null; then
    echo "host    ${PG_DB}    ${PG_USER}    127.0.0.1/32    md5" >> "${PG_CONF}/pg_hba.conf"
  fi
  echo "  Updated pg_hba.conf for md5 auth"
fi

# Ensure listen_addresses includes localhost
sed -i "s/^#\?listen_addresses\s*=.*/listen_addresses = 'localhost'/" "${PG_CONF}/postgresql.conf"

# Start PostgreSQL (non-systemd)
if pg_isready -q 2>/dev/null; then
  echo "  PostgreSQL is already running"
  # Reload config changes
  su - postgres -c "/usr/lib/postgresql/${PG_VER}/bin/pg_ctl reload -D ${PG_DATA}" 2>/dev/null || true
else
  echo "  Starting PostgreSQL..."
  su - postgres -c "/usr/lib/postgresql/${PG_VER}/bin/pg_ctl start -D ${PG_DATA} -l /var/log/postgresql/postgresql.log -o '-c config_file=${PG_CONF}/postgresql.conf'" || true
  # Wait for it
  for i in $(seq 1 15); do
    if pg_isready -q 2>/dev/null; then break; fi
    sleep 1
  done
  if pg_isready -q 2>/dev/null; then
    echo "  PostgreSQL started"
  else
    fail "PostgreSQL failed to start. Check /var/log/postgresql/postgresql.log"
  fi
fi

# Create user + database
su - postgres -c "/usr/bin/psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='${PG_USER}'\"" \
  | grep -q 1 \
  || su - postgres -c "/usr/bin/psql -c \"CREATE USER ${PG_USER} WITH PASSWORD '${PG_PASS}'\""

su - postgres -c "/usr/bin/psql -tc \"SELECT 1 FROM pg_database WHERE datname='${PG_DB}'\"" \
  | grep -q 1 \
  || su - postgres -c "/usr/bin/psql -c \"CREATE DATABASE ${PG_DB} OWNER ${PG_USER}\""

echo "  Database '${PG_DB}' ready (user: ${PG_USER})"

# ─── Redis setup ─────────────────────────────────────────────────────────────
step "Configuring Redis..."

REDIS_CONF="/etc/redis/redis.conf"
if [[ -f "${REDIS_CONF}" ]]; then
  # Set password
  sed -i "s/^# requirepass.*/requirepass ${REDIS_PASS}/" "${REDIS_CONF}"
  sed -i "s/^requirepass.*/requirepass ${REDIS_PASS}/" "${REDIS_CONF}"
  # Ensure password is set even if no commented line exists
  if ! grep -q "^requirepass" "${REDIS_CONF}"; then
    echo "requirepass ${REDIS_PASS}" >> "${REDIS_CONF}"
  fi
  # Set maxmemory
  sed -i "s/^# maxmemory .*/maxmemory 256mb/" "${REDIS_CONF}"
  if ! grep -q "^maxmemory " "${REDIS_CONF}"; then
    echo "maxmemory 256mb" >> "${REDIS_CONF}"
  fi
  sed -i "s/^# maxmemory-policy.*/maxmemory-policy allkeys-lru/" "${REDIS_CONF}"
  if ! grep -q "^maxmemory-policy" "${REDIS_CONF}"; then
    echo "maxmemory-policy allkeys-lru" >> "${REDIS_CONF}"
  fi
  # Bind to localhost only
  sed -i "s/^bind .*/bind 127.0.0.1/" "${REDIS_CONF}"
  # Disable daemonize (supervisor manages it)
  sed -i "s/^daemonize yes/daemonize no/" "${REDIS_CONF}"
fi

# Start Redis (non-systemd) if not already running
if redis-cli -a "${REDIS_PASS}" ping 2>/dev/null | grep -q PONG; then
  echo "  Redis is already running"
else
  echo "  Starting Redis..."
  nohup redis-server "${REDIS_CONF}" > /var/log/redis/redis-server.log 2>&1 &
  sleep 2
  if redis-cli -a "${REDIS_PASS}" ping 2>/dev/null | grep -q PONG; then
    echo "  Redis started"
  else
    warn "Redis may not have started. Check /var/log/redis/redis-server.log"
  fi
fi

# ─── Python virtualenvs ─────────────────────────────────────────────────────
step "Setting up Python virtual environments..."

cd "${MOODBEATZ_DIR}"

# Backend venv
if [[ ! -d "${MOODBEATZ_DIR}/backend/.venv" ]]; then
  python3.11 -m venv "${MOODBEATZ_DIR}/backend/.venv"
  echo "  Created backend venv"
fi
"${MOODBEATZ_DIR}/backend/.venv/bin/pip" install --quiet --upgrade pip
"${MOODBEATZ_DIR}/backend/.venv/bin/pip" install --quiet -r "${MOODBEATZ_DIR}/backend/requirements.txt"
echo "  Backend dependencies installed"

# Recommendation service venv
if [[ ! -d "${MOODBEATZ_DIR}/recommendation_system/.venv" ]]; then
  python3.11 -m venv "${MOODBEATZ_DIR}/recommendation_system/.venv"
  echo "  Created recommendation service venv"
fi
"${MOODBEATZ_DIR}/recommendation_system/.venv/bin/pip" install --quiet --upgrade pip
"${MOODBEATZ_DIR}/recommendation_system/.venv/bin/pip" install --quiet -r "${MOODBEATZ_DIR}/recommendation_system/requirements.txt"
echo "  Recommendation service dependencies installed"

# ─── Frontend build ─────────────────────────────────────────────────────────
step "Building frontend..."

cd "${MOODBEATZ_DIR}/frontend"
npm ci --silent 2>/dev/null || npm install --silent
npm run build
echo "  Frontend built to dist/"

# ─── Caddy config ────────────────────────────────────────────────────────────
step "Configuring Caddy..."

mkdir -p /etc/caddy
cat > /etc/caddy/Caddyfile <<CADDYEOF
${PUBLIC_HOST} {
    encode zstd gzip

    # Recommendation service routes (more specific, must come first)
    handle /api/recommendations* {
        reverse_proxy 127.0.0.1:8002
    }

    # All other API traffic → FastAPI backend
    handle /api/* {
        reverse_proxy 127.0.0.1:8001
    }

    # Frontend (static files from Vite build)
    handle {
        root * ${MOODBEATZ_DIR}/frontend/dist
        try_files {path} /index.html
        file_server
    }
}
CADDYEOF

echo "  Caddyfile written"

# ─── Environment file for native services ────────────────────────────────────
step "Creating native .env overrides..."

# For native deploy, DATABASE_URL and REDIS_URL use localhost, not Docker names
NATIVE_ENV="${MOODBEATZ_DIR}/.env.native"
cat > "${NATIVE_ENV}" <<ENVEOF
# Auto-generated by vps-native-bootstrap.sh — native deploy overrides
# These override the Docker-oriented values in .env
DATABASE_URL=postgresql+asyncpg://${PG_USER}:${PG_PASS}@127.0.0.1:5432/${PG_DB}
REDIS_URL=redis://:${REDIS_PASS}@127.0.0.1:6379/0
RECO_SERVICE_URL=http://127.0.0.1:8002
ENVIRONMENT=production
CACHE_ENABLED=true
RUN_MIGRATIONS_ON_STARTUP=true
ALLOWED_ORIGINS=http://localhost:3000,https://${PUBLIC_HOST}
FAISS_ENABLED=true
FAISS_INDEX_PATH=/var/moodbeatz/faiss/songs
FAISS_MIN_CATALOG_SIZE=50
ENVEOF

# Merge .env + .env.native (native overrides win)
echo "  Created ${NATIVE_ENV}"

# ─── FAISS data directory ────────────────────────────────────────────────────
mkdir -p /var/moodbeatz/faiss

# ─── Supervisor configuration ────────────────────────────────────────────────
step "Configuring supervisord..."

mkdir -p /var/log/moodbeatz
mkdir -p /etc/supervisor/conf.d

# Build the merged env string for supervisor
# (supervisor environment= expects KEY="val",KEY2="val2" format)
build_env_line() {
  local env_str=""
  # Read .env first, then .env.native overrides
  while IFS='=' read -r key value; do
    [[ -z "${key}" || "${key}" =~ ^# ]] && continue
    # Remove surrounding quotes if present
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
    if [[ -n "${env_str}" ]]; then
      env_str="${env_str},${key}=\"${value}\""
    else
      env_str="${key}=\"${value}\""
    fi
  done < <(cat "${MOODBEATZ_DIR}/.env" "${MOODBEATZ_DIR}/.env.native" 2>/dev/null | grep -v '^#' | grep -v '^$')
  echo "${env_str}"
}

SUP_ENV=$(build_env_line)

cat > /etc/supervisor/conf.d/moodbeatz.conf <<SUPEOF
; ============================================================================
; MoodBeatz Supervisor Configuration (native deploy)
; ============================================================================

[program:postgresql]
command=/usr/lib/postgresql/${PG_VER}/bin/postgres -D ${PG_DATA} -c config_file=${PG_CONF}/postgresql.conf
user=postgres
autostart=true
autorestart=true
priority=10
stdout_logfile=/var/log/moodbeatz/postgresql.log
stderr_logfile=/var/log/moodbeatz/postgresql-error.log
startsecs=5
stopwaitsecs=30

[program:redis]
command=redis-server ${REDIS_CONF}
autostart=true
autorestart=true
priority=15
stdout_logfile=/var/log/moodbeatz/redis.log
stderr_logfile=/var/log/moodbeatz/redis-error.log
startsecs=3

[program:moodbeatz-backend]
command=${MOODBEATZ_DIR}/backend/.venv/bin/gunicorn app.main:app
    --bind 127.0.0.1:8001
    --workers 4
    --worker-class uvicorn.workers.UvicornWorker
    --timeout 120
    --graceful-timeout 30
    --access-logfile -
directory=${MOODBEATZ_DIR}/backend
environment=${SUP_ENV}
autostart=true
autorestart=true
priority=20
stdout_logfile=/var/log/moodbeatz/backend.log
stderr_logfile=/var/log/moodbeatz/backend-error.log
startsecs=10
stopwaitsecs=15

[program:moodbeatz-recommendation]
command=${MOODBEATZ_DIR}/recommendation_system/.venv/bin/gunicorn recommendation_system.main:app
    --bind 127.0.0.1:8002
    --workers 2
    --worker-class uvicorn.workers.UvicornWorker
    --timeout 120
    --graceful-timeout 30
    --access-logfile -
directory=${MOODBEATZ_DIR}
environment=${SUP_ENV},PYTHONPATH="${MOODBEATZ_DIR}/backend:${MOODBEATZ_DIR}"
autostart=true
autorestart=true
priority=25
stdout_logfile=/var/log/moodbeatz/recommendation.log
stderr_logfile=/var/log/moodbeatz/recommendation-error.log
startsecs=15
stopwaitsecs=15

[program:caddy]
command=caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
autostart=true
autorestart=true
priority=30
stdout_logfile=/var/log/moodbeatz/caddy.log
stderr_logfile=/var/log/moodbeatz/caddy-error.log
startsecs=3

[group:moodbeatz]
programs=postgresql,redis,moodbeatz-backend,moodbeatz-recommendation,caddy
priority=100
SUPEOF

echo "  Supervisor config written to /etc/supervisor/conf.d/moodbeatz.conf"

# ─── Run Alembic migrations ─────────────────────────────────────────────────
step "Running database migrations..."

cd "${MOODBEATZ_DIR}/backend"
export DATABASE_URL="postgresql+asyncpg://${PG_USER}:${PG_PASS}@127.0.0.1:5432/${PG_DB}"
"${MOODBEATZ_DIR}/backend/.venv/bin/python" -m alembic upgrade head 2>&1 || warn "Alembic migration returned non-zero"

# ─── Start all services ─────────────────────────────────────────────────────
step "Starting all services via supervisord..."

# Kill services that were started manually during bootstrap (not via supervisor)
pkill -f 'redis-server' 2>/dev/null || true
su - postgres -c "/usr/lib/postgresql/${PG_VER}/bin/pg_ctl stop -D ${PG_DATA} -m fast" 2>/dev/null || true
sleep 2

# Start or reload supervisord (DO NOT pkill — on container VPS, that can kill the container)
if pgrep -x supervisord >/dev/null 2>&1; then
  echo "  supervisord already running — reloading config..."
  supervisorctl reread 2>/dev/null || true
  supervisorctl update 2>/dev/null || true
  supervisorctl restart all 2>/dev/null || true
else
  echo "  Starting supervisord..."
  supervisord -c /etc/supervisor/supervisord.conf 2>/dev/null \
    || supervisord -c /etc/supervisord.conf 2>/dev/null \
    || supervisord 2>/dev/null
fi

# Wait for services to come up
sleep 8

echo ""
echo "  Service status:"
supervisorctl status 2>/dev/null || echo "  (supervisorctl not reachable — check supervisord config)"

# ─── Health checks ───────────────────────────────────────────────────────────
step "Running health checks..."

ALL_PASS=true

check_health() {
  local label="$1"
  local url="$2"
  local code
  code=$(curl -o /dev/null -s -w "%{http_code}" --max-time 8 "${url}" 2>/dev/null || echo "000")
  if [[ "${code}" == "200" ]]; then
    printf "  ${GREEN}PASS${NC} %-40s HTTP %s\n" "${label}" "${code}"
  else
    printf "  ${RED}FAIL${NC} %-40s HTTP %s\n" "${label}" "${code}"
    ALL_PASS=false
  fi
}

check_health "PostgreSQL (via backend)" "http://127.0.0.1:8001/api/health"
check_health "Recommendation service"  "http://127.0.0.1:8002/api/health"

echo ""
if [[ "${ALL_PASS}" == "true" ]]; then
  printf "  Overall: ${GREEN}${BOLD}ALL CHECKS PASSED ✓${NC}\n"
else
  printf "  Overall: ${YELLOW}Some checks failed — services may still be starting${NC}\n"
  echo "  Wait 30s and retry: curl http://127.0.0.1:8001/api/health"
fi

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  MoodBeatz Native Deploy Complete                ║"
echo "╠══════════════════════════════════════════════════╣"
printf "║  Site:    ${BOLD}https://${PUBLIC_HOST}${NC}\n"
printf "║  API:     ${BOLD}https://${PUBLIC_HOST}/api/health${NC}\n"
printf "║  Reco:    ${BOLD}http://127.0.0.1:8002/api/health${NC}\n"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "Useful commands:"
echo "  supervisorctl status                # check all services"
echo "  supervisorctl restart moodbeatz-backend  # restart backend"
echo "  supervisorctl tail -f moodbeatz-backend  # tail backend logs"
echo "  tail -f /var/log/moodbeatz/*.log    # all logs"
echo ""
