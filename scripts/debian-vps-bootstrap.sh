#!/usr/bin/env bash
# -----------------------------------------------------------------------
# MoodBeats VPS Bootstrap
# Run on the Debian VPS as root after cloning the repo:
#
#   bash /opt/moodbeats/scripts/debian-vps-bootstrap.sh <public_hostname> [repo_dir]
#
# Example (nip.io — free, automatic DNS + Let's Encrypt):
#   bash /opt/moodbeats/scripts/debian-vps-bootstrap.sh 148.135.138.197.nip.io /opt/moodbeats
#
# Prerequisites
#   • Ports 80 and 443 open in your cloud firewall (for ACME HTTP-01 challenge)
#   • .env already written at MOODBEATS_DIR/.env with real Clerk + YouTube keys
#     (copy from your laptop: scp .env root@<vps>:/opt/moodbeats/.env)
# -----------------------------------------------------------------------

set -euo pipefail

PUBLIC_HOST="${1:?Usage: $0 <public_hostname> [moodbeats_dir]}"
MOODBEATS_DIR="${2:-$PWD}"
API_BASE="https://${PUBLIC_HOST}"

if [[ ! -f "${MOODBEATS_DIR}/docker-compose.yml" ]]; then
  echo "docker-compose.yml not found under ${MOODBEATS_DIR}" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl git ufw

# --- Firewall ---
ufw allow 22/tcp  comment 'ssh'   || true
ufw allow 80/tcp  comment 'http'  || true
ufw allow 443/tcp comment 'https' || true
ufw --force enable || true

# --- Docker ---
if ! command -v docker &>/dev/null; then
  echo "Installing Docker..."
  apt-get install -y -qq docker.io docker-compose-plugin
  systemctl enable --now docker
else
  echo "Docker already installed: $(docker --version)"
fi

# --- Caddy (TLS + reverse proxy) ---
if ! command -v caddy &>/dev/null; then
  echo "Installing Caddy..."
  apt-get install -y -qq caddy
fi

cat >/etc/caddy/Caddyfile <<EOF
${PUBLIC_HOST} {
    encode zstd gzip

    # All API traffic → FastAPI backend (port 8001)
    handle /api/* {
        reverse_proxy 127.0.0.1:8001
    }

    # Everything else → Next.js frontend (port 3000)
    handle {
        reverse_proxy 127.0.0.1:3000
    }
}
EOF

systemctl enable caddy
systemctl reload-or-restart caddy

# --- .env ---------------------------------------------------------------
cd "${MOODBEATS_DIR}"

if [[ ! -f .env ]]; then
  echo "ERROR: .env not found at ${MOODBEATS_DIR}/.env" >&2
  echo "Copy it from your local machine:" >&2
  echo "  scp /home/chintan/MoodBeats/.env root@$(hostname -I | awk '{print $1}'):${MOODBEATS_DIR}/.env" >&2
  exit 1
fi

# Source .env to validate required keys
set -a
# shellcheck disable=SC1091
source .env
set +a

# Auto-generate strong passwords for DB/Redis if placeholders are still set
if [[ "${POSTGRES_PASSWORD:-change-me-strong-password}" == "change-me-strong-password" ]]; then
  POSTGRES_PASSWORD="$(openssl rand -hex 20)"
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASSWORD}|" .env
  echo "Generated new POSTGRES_PASSWORD."
fi

if [[ "${REDIS_PASSWORD:-change-me-redis-password}" == "change-me-redis-password" ]]; then
  REDIS_PASSWORD="$(openssl rand -hex 20)"
  sed -i "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=${REDIS_PASSWORD}|" .env
  echo "Generated new REDIS_PASSWORD."
fi

# Ensure NEXT_PUBLIC_API_URL and ALLOWED_ORIGINS point to the public domain
if grep -q "^NEXT_PUBLIC_API_URL=" .env; then
  sed -i "s|^NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=${API_BASE}|" .env
else
  echo "NEXT_PUBLIC_API_URL=${API_BASE}" >> .env
fi

if grep -q "^ALLOWED_ORIGINS=" .env; then
  sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=${API_BASE}|" .env
else
  echo "ALLOWED_ORIGINS=${API_BASE}" >> .env
fi

# Fail-fast on missing/placeholder Clerk + YouTube keys
placeholder_pattern='^(change-me|sk_test_x|pk_test_x|AIzaSyX|https://your-tenant|xxxxx).*'
missing=()
check_key() {
  local name="$1"
  local val="${!name:-}"
  if [[ -z "${val}" ]]; then
    missing+=("${name} (empty)")
  elif [[ "${val}" =~ ${placeholder_pattern} ]]; then
    missing+=("${name} (still a placeholder)")
  fi
}

check_key CLERK_SECRET_KEY
check_key CLERK_ISSUER
check_key CLERK_JWKS_URL
check_key NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
check_key YOUTUBE_API_KEY

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "" >&2
  echo "ERROR: The following .env values are missing or are placeholders:" >&2
  for m in "${missing[@]}"; do
    echo "  - ${m}" >&2
  done
  echo "" >&2
  echo "Edit ${MOODBEATS_DIR}/.env with your real Clerk/YouTube credentials and re-run." >&2
  exit 1
fi

# --- Build + launch stack -----------------------------------------------
echo ""
echo "Building Docker images (NEXT_PUBLIC_API_URL=${API_BASE})..."
docker compose build --pull

echo "Starting stack..."
docker compose up -d

# --- Wait for health ----------------------------------------------------
echo "Waiting for API health..."
for i in {1..60}; do
  if curl -sf "http://127.0.0.1:8001/api/health" | grep -q healthy 2>/dev/null; then
    echo "Backend is healthy."
    break
  fi
  if [[ "${i}" -eq 60 ]]; then
    echo "Timeout: backend not healthy after 120s." >&2
    echo "Check logs: docker compose logs backend" >&2
    exit 1
  fi
  sleep 2
done

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  MoodBeats is live!                              ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  Site:    https://${PUBLIC_HOST}"
echo "║  API:     https://${PUBLIC_HOST}/api/health"
echo "║  Docs:    https://${PUBLIC_HOST}/api/docs"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  • Add https://${PUBLIC_HOST} as an allowed origin in your Clerk dashboard."
echo "  • Verify TLS: curl -sI https://${PUBLIC_HOST}"
echo ""
echo "Logs: docker compose logs -f"
echo "Stop: docker compose down"
