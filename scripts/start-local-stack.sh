#!/usr/bin/env bash
# Start PostgreSQL + Redis + backend + frontend via Docker Compose (repo root).
# Requires Docker Engine running and permission to use the socket.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

if ! docker info &>/dev/null; then
  echo "Docker is not reachable (/var/run/docker.sock)." >&2
  echo "On Arch Linux, start the daemon once (needs sudo):" >&2
  echo "  sudo systemctl enable --now docker" >&2
  echo "Then allow your user to run compose without sudo:" >&2
  echo "  sudo usermod -aG docker \"\$USER\" && newgrp docker" >&2
  echo "Re-run: ${ROOT}/scripts/start-local-stack.sh" >&2
  exit 1
fi

# Ensure we have an .env. If not, bootstrap from .env.example and ask the user
# to fill in secrets before the build.
if [[ ! -f "${ROOT}/.env" ]]; then
  if [[ -f "${ROOT}/.env.example" ]]; then
    cp "${ROOT}/.env.example" "${ROOT}/.env"
    echo "Created ${ROOT}/.env from .env.example"
    echo "Edit it with your real Clerk / YouTube / Redis credentials, then re-run this script."
    exit 1
  else
    echo ".env missing and no .env.example found at repo root." >&2
    exit 1
  fi
fi

# Surface obviously-unset required values up front rather than building a
# broken stack.
set -a
# shellcheck disable=SC1091
source "${ROOT}/.env"
set +a

missing=()
placeholder_pattern='^(change-me|sk_test_x|pk_test_x|AIzaSyX|https://your-tenant).*'
check_var() {
  local name="$1"
  local val="${!name:-}"
  if [[ -z "${val}" ]]; then
    missing+=("${name} (empty)")
    return
  fi
  if [[ "${val}" =~ ${placeholder_pattern} ]]; then
    missing+=("${name} (placeholder value)")
  fi
}

check_var CLERK_ISSUER
check_var CLERK_SECRET_KEY
check_var REDIS_PASSWORD
check_var NEXT_PUBLIC_API_URL
check_var NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

if [[ -z "${YOUTUBE_API_KEY:-}" ]] || [[ "${YOUTUBE_API_KEY}" =~ ${placeholder_pattern} ]]; then
  echo "WARN: YOUTUBE_API_KEY missing or still a placeholder — YouTube search will use curated" >&2
  echo "      fallback results until you set a real Data API key in .env." >&2
fi

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "Missing or placeholder required values in .env:" >&2
  for m in "${missing[@]}"; do
    echo "  - ${m}" >&2
  done
  echo "Fill these in and re-run. (See .env.example for hints.)" >&2
  exit 1
fi

echo "Building and starting stack (Postgres volume: pgdata, Redis AOF: redisdata)..."
docker-compose up --build -d

echo "Waiting for API health..."
for i in {1..60}; do
  if curl -sf "http://127.0.0.1:8001/api/health" | grep -q healthy; then
    echo "Backend healthy."
    break
  fi
  if [[ "${i}" -eq 60 ]]; then
    echo "Timeout waiting for http://127.0.0.1:8001/api/health -- check: docker-compose logs backend" >&2
    exit 1
  fi
  sleep 2
done

echo ""
echo "MoodBeats is up:"
echo "  Frontend: http://127.0.0.1:3001"
echo "  API docs:  http://127.0.0.1:8001/docs"
echo "  Health:    http://127.0.0.1:8001/api/health"
echo ""
echo "Logs: docker-compose logs -f"
echo "Stop: docker-compose down"
