#!/usr/bin/env bash
# =============================================================================
# MoodBeatz VPS — One-Shot Setup
# Run this DIRECTLY on the VPS as root:
#
#   curl -sL https://raw.githubusercontent.com/moodifymusicly-bot/moodbeatz/main/scripts/vps-setup-oneshot.sh | bash
#   -- OR --
#   bash /opt/moodbeatz/scripts/vps-setup-oneshot.sh   (if already rsync'd)
#
# This script:
#   1. Installs Docker, Docker Compose plugin, and Caddy
#   2. Configures UFW firewall (ports 22, 80, 443)
#   3. Clones the repo to /opt/moodbeatz
#   4. Sources .env (must already be at /opt/moodbeatz/.env)
#   5. Builds + launches the full Docker Compose stack
#   6. Configures Caddy as TLS reverse proxy to 148.135.138.197.nip.io
# =============================================================================

set -euo pipefail

PUBLIC_HOST="148.135.138.197.nip.io"
REPO_URL="https://github.com/moodifymusicly-bot/moodbeatz.git"
DEST="/opt/moodbeatz"
API_BASE="https://${PUBLIC_HOST}"

log() { echo -e "\n\033[1;36m==>\033[0m $*"; }
err() { echo -e "\033[1;31mERROR:\033[0m $*" >&2; exit 1; }

# --- System Packages --------------------------------------------------------
log "Updating packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl git ufw rsync

# --- Docker -----------------------------------------------------------------
if ! command -v docker &>/dev/null; then
  log "Installing Docker..."
  apt-get install -y -qq docker.io docker-compose-plugin
  systemctl enable --now docker
  log "Docker installed: $(docker --version)"
else
  log "Docker already installed: $(docker --version)"
  # Ensure compose plugin exists
  docker compose version &>/dev/null || apt-get install -y -qq docker-compose-plugin
fi

# --- Caddy ------------------------------------------------------------------
if ! command -v caddy &>/dev/null; then
  log "Installing Caddy..."
  apt-get install -y -qq caddy
fi

# --- Firewall ---------------------------------------------------------------
log "Configuring firewall..."
ufw allow 22/tcp  comment 'ssh'   2>/dev/null || true
ufw allow 80/tcp  comment 'http'  2>/dev/null || true
ufw allow 443/tcp comment 'https' 2>/dev/null || true
ufw --force enable 2>/dev/null || true

# --- Clone / Update Repo ----------------------------------------------------
if [[ -d "${DEST}/.git" ]]; then
  log "Updating existing repo at ${DEST}..."
  cd "${DEST}"
  git pull
else
  log "Cloning repo to ${DEST}..."
  git clone "${REPO_URL}" "${DEST}"
  cd "${DEST}"
fi

# --- .env Check -------------------------------------------------------------
if [[ ! -f "${DEST}/.env" ]]; then
  err ".env not found at ${DEST}/.env\n\nSCP it from your local machine first:\n  scp /home/chintan/MoodBeatz/.env root@148.135.138.197:${DEST}/.env\n\nThen re-run this script."
fi

log "Loading .env..."
set -a
# shellcheck disable=SC1091
source "${DEST}/.env"
set +a

# Auto-generate strong passwords for DB/Redis if still placeholder
fix_placeholder() {
  local name="$1" val="${!1:-}" new_val
  local bad_pattern='^(change-me|moodmusic_local_pw|redis_local_pw)'
  if [[ -z "${val}" ]] || [[ "${val}" =~ ${bad_pattern} ]]; then
    new_val="$(openssl rand -hex 20)"
    if grep -q "^${name}=" "${DEST}/.env"; then
      sed -i "s|^${name}=.*|${name}=${new_val}|" "${DEST}/.env"
    else
      echo "${name}=${new_val}" >> "${DEST}/.env"
    fi
    export "${name}=${new_val}"
    log "Auto-generated ${name}"
  fi
}

fix_placeholder POSTGRES_PASSWORD
fix_placeholder REDIS_PASSWORD

# Update NEXT_PUBLIC_API_URL + ALLOWED_ORIGINS to point at the domain
upsert_env() {
  local name="$1" val="$2"
  if grep -q "^${name}=" "${DEST}/.env"; then
    sed -i "s|^${name}=.*|${name}=${val}|" "${DEST}/.env"
  else
    echo "${name}=${val}" >> "${DEST}/.env"
  fi
}
# Patch VITE_API_URL in frontend/.env.production (baked into the Docker image at build time)
FRONTEND_ENV="${DEST}/frontend/.env.production"
if [[ -f "${FRONTEND_ENV}" ]]; then
  if grep -q "^VITE_API_URL=" "${FRONTEND_ENV}"; then
    sed -i "s|^VITE_API_URL=.*|VITE_API_URL=${API_BASE}|" "${FRONTEND_ENV}"
  else
    echo "VITE_API_URL=${API_BASE}" >> "${FRONTEND_ENV}"
  fi
else
  echo "VITE_API_URL=${API_BASE}" > "${FRONTEND_ENV}"
  echo "VITE_CLERK_PUBLISHABLE_KEY=" >> "${FRONTEND_ENV}"
  log "Created ${FRONTEND_ENV} — set VITE_CLERK_PUBLISHABLE_KEY manually if missing."
fi
upsert_env ALLOWED_ORIGINS "${API_BASE},https://148.135.138.197"
upsert_env ENVIRONMENT "production"

# Re-source to pick up changes
set -a
source "${DEST}/.env"
set +a

# Fail-fast on missing Clerk / YouTube keys
placeholder_check='^(change-me|sk_test_x|pk_test_x|AIzaSyX|https://your-tenant|xxxxx)'
missing=()
need_key() {
  local name="$1" val="${!1:-}"
  if [[ -z "${val}" ]] || [[ "${val}" =~ ${placeholder_check} ]]; then
    missing+=("${name}")
  fi
}
need_key CLERK_SECRET_KEY
need_key CLERK_ISSUER
need_key CLERK_JWKS_URL
need_key YOUTUBE_API_KEY
# Note: VITE_CLERK_PUBLISHABLE_KEY lives in frontend/.env.production, not root .env.

if [[ ${#missing[@]} -gt 0 ]]; then
  err "These .env keys are missing or still placeholder:\n$(printf '  - %s\n' "${missing[@]}")\n\nEdit ${DEST}/.env and re-run."
fi

# --- Build + Launch Stack ---------------------------------------------------
log "Building Docker images (NEXT_PUBLIC_API_URL=${API_BASE})..."
cd "${DEST}"
docker compose build --pull

log "Starting stack..."
docker compose up -d

# --- Wait for Backend Health ------------------------------------------------
log "Waiting for backend health (up to 120s)..."
for i in {1..60}; do
  if curl -sf "http://127.0.0.1:8001/api/health" 2>/dev/null | grep -q healthy; then
    log "Backend is healthy ✓"
    break
  fi
  [[ "${i}" -eq 60 ]] && err "Backend not healthy after 120s. Check: docker compose logs backend"
  sleep 2
done

# --- Configure Caddy --------------------------------------------------------
log "Writing Caddyfile..."
cat >/etc/caddy/Caddyfile <<EOF
${PUBLIC_HOST} {
    encode zstd gzip

    # API traffic → FastAPI (port 8001)
    handle /api/* {
        reverse_proxy 127.0.0.1:8001
    }

    # All other traffic → Vite/nginx frontend (port 3000)
    handle {
        reverse_proxy 127.0.0.1:3000
    }
}
EOF

log "Reloading Caddy..."
systemctl enable caddy
caddy reload --config /etc/caddy/Caddyfile 2>/dev/null || systemctl restart caddy

# --- Done -------------------------------------------------------------------
echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║  🎵 MoodBeatz is LIVE!                                ║"  
echo "╠═══════════════════════════════════════════════════════╣"
echo "║  Site:  https://${PUBLIC_HOST}        ║"
echo "║  API:   https://${PUBLIC_HOST}/api/health ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo ""
echo "⚠️  ACTION REQUIRED:"
echo "   Add https://${PUBLIC_HOST} as an allowed origin"
echo "   in your Clerk dashboard → Settings → Domains."
echo ""
echo "Verify TLS: curl -sI https://${PUBLIC_HOST}"
echo "Logs:       docker compose -f ${DEST}/docker-compose.yml logs -f"
