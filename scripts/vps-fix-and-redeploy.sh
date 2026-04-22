#!/usr/bin/env bash
# =============================================================
# vps-fix-and-redeploy.sh
# Run this INSIDE your SSH session on the VPS:
#   bash /root/MoodBeats/scripts/vps-fix-and-redeploy.sh
# =============================================================
set -euo pipefail

REPO="${REPO:-/root/MoodBeats}"

# Auto-detect the public hostname from the live Caddyfile.
# Falls back to sslip.io if Caddy is not installed or Caddyfile is missing.
if [[ -f /etc/caddy/Caddyfile ]]; then
  PUBLIC_HOST=$(grep -m1 '\.' /etc/caddy/Caddyfile | awk '{print $1}' | tr -d '{}' | xargs)
  echo "==> Detected public host from Caddyfile: ${PUBLIC_HOST}"
else
  PUBLIC_HOST="148.135.138.197.sslip.io"
  echo "==> Caddyfile not found, defaulting to: ${PUBLIC_HOST}"
fi
API_BASE="https://${PUBLIC_HOST}"

cd "$REPO"

echo "==> Current .env check"
grep "NEXT_PUBLIC_API_URL\|YOUTUBE_API_KEY\|CLERK_ISSUER\|ALLOWED_ORIGINS" .env || true

echo ""
echo "==> Patching .env for production VPS URLs..."

# Fix NEXT_PUBLIC_API_URL (baked into the frontend Docker image at build time)
if grep -q "^NEXT_PUBLIC_API_URL=" .env; then
  sed -i "s|^NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=${API_BASE}|" .env
else
  echo "NEXT_PUBLIC_API_URL=${API_BASE}" >> .env
fi

# Fix ALLOWED_ORIGINS
if grep -q "^ALLOWED_ORIGINS=" .env; then
  sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=${API_BASE},https://148.135.138.197|" .env
else
  echo "ALLOWED_ORIGINS=${API_BASE},https://148.135.138.197" >> .env
fi

# Ensure ENVIRONMENT=production
if grep -q "^ENVIRONMENT=" .env; then
  sed -i "s|^ENVIRONMENT=.*|ENVIRONMENT=production|" .env
else
  echo "ENVIRONMENT=production" >> .env
fi

# Ensure RUN_MIGRATIONS_ON_STARTUP=true
if grep -q "^RUN_MIGRATIONS_ON_STARTUP=" .env; then
  sed -i "s|^RUN_MIGRATIONS_ON_STARTUP=.*|RUN_MIGRATIONS_ON_STARTUP=true|" .env
else
  echo "RUN_MIGRATIONS_ON_STARTUP=true" >> .env
fi

echo ""
echo "==> Updated .env values:"
grep "NEXT_PUBLIC_API_URL\|YOUTUBE_API_KEY\|CLERK_ISSUER\|ALLOWED_ORIGINS\|ENVIRONMENT" .env

echo ""
echo "==> Verifying YOUTUBE_API_KEY is set..."
YT_KEY=$(grep "^YOUTUBE_API_KEY=" .env | cut -d= -f2- | tr -d '\r\n ')
if [[ -z "$YT_KEY" ]]; then
  echo "ERROR: YOUTUBE_API_KEY is not set in .env! Songs will not load."
  echo "Add: YOUTUBE_API_KEY=AIza... to .env and re-run."
  exit 1
else
  echo "YOUTUBE_API_KEY is set (length=${#YT_KEY})"
fi

echo ""
echo "==> Rebuilding Docker stack (this will rebuild the frontend with new NEXT_PUBLIC_API_URL)..."
export DOCKER_BUILDKIT=1
docker compose down --remove-orphans 2>/dev/null || true
docker compose up -d --build

echo ""
echo "==> Waiting for services to be healthy..."
sleep 15

echo ""
echo "==> Health checks:"
curl -sf http://127.0.0.1:8001/api/health && echo " Backend: OK" || echo " Backend: FAILED"
curl -sf http://127.0.0.1:8001/api/youtube/health | python3 -m json.tool 2>/dev/null || echo " YouTube health check failed"
curl -sf http://127.0.0.1:3000 > /dev/null && echo " Frontend: OK" || echo " Frontend: FAILED or still starting"

echo ""
echo "==> Docker container status:"
docker compose ps

echo ""
echo "==> Recent backend logs (last 30 lines):"
docker logs moodbeats-backend --tail 30 2>&1

echo ""
echo "==> Done. Visit: ${API_BASE}"
