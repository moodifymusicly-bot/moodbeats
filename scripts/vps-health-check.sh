#!/usr/bin/env bash
# -----------------------------------------------------------------------
# Run ON the VPS (as root or a user in the docker group), from the repo:
#
#   bash /opt/moodbeats/scripts/vps-health-check.sh
#
# Or from your laptop over SSH:
#   ssh root@YOUR_VPS 'bash -s' < scripts/vps-health-check.sh
#
# Checks: Docker Compose stack, local API + frontend, Caddy, optional HTTPS.
# -----------------------------------------------------------------------

set -u

MOODBEATS_DIR="${MOODBEATS_DIR:-/opt/moodbeats}"
PUBLIC_HOST="${PUBLIC_HOST:-148.135.138.197.nip.io}"

failures=0
ok() { printf '\033[1;32mOK\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mWARN\033[0m %s\n' "$*" >&2; }
bad() { printf '\033[1;31mFAIL\033[0m %s\n' "$*" >&2; failures=$((failures + 1)); }

echo "=== MoodBeats VPS health (${MOODBEATS_DIR}) ==="
echo

if [[ ! -d "${MOODBEATS_DIR}" ]]; then
  bad "Directory missing: ${MOODBEATS_DIR}"
  exit 1
fi
cd "${MOODBEATS_DIR}" || exit 1

if ! command -v docker &>/dev/null; then
  bad "docker not installed"
  exit 1
fi

echo "--- docker compose ps ---"
if docker compose ps 2>/dev/null; then
  :
else
  bad "docker compose ps failed (run from ${MOODBEATS_DIR} with compose file present?)"
fi
echo

echo "--- container names (expect moodbeats-*) ---"
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | head -20
echo

for name in moodbeats-db moodbeats-redis moodbeats-backend moodbeats-frontend; do
  if docker ps --format '{{.Names}}' | grep -qx "${name}"; then
    ok "running: ${name}"
  else
    bad "not running: ${name}"
  fi
done
echo

echo "--- API http://127.0.0.1:8001/api/health ---"
if out=$(curl -sf --max-time 5 http://127.0.0.1:8001/api/health 2>&1); then
  ok "backend responds"
  echo "${out}" | head -c 500
  echo
else
  bad "backend health failed: ${out:-curl error}"
fi
echo

echo "--- Frontend http://127.0.0.1:3000 ---"
if code=$(curl -sf -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3000 2>/dev/null); then
  ok "frontend HTTP ${code}"
else
  bad "frontend not responding on :3000"
fi
echo

echo "--- Caddy ---"
if command -v systemctl &>/dev/null; then
  if systemctl is-active --quiet caddy 2>/dev/null; then
    ok "caddy active"
  else
    bad "caddy not active (systemctl status caddy)"
  fi
else
  warn "systemctl not available; skip caddy check"
fi
echo

echo "--- Public HTTPS https://${PUBLIC_HOST}/api/health ---"
if code=$(curl -sf -o /dev/null -w '%{http_code}' --max-time 15 "https://${PUBLIC_HOST}/api/health" 2>/dev/null); then
  ok "public API HTTPS ${code}"
else
  warn "public URL not reachable from this host (firewall/DNS/Clerk unrelated) — test from your laptop: curl -sI https://${PUBLIC_HOST}/api/health"
fi
echo

echo "--- Last 30 lines: backend ---"
docker compose logs backend --tail 30 2>&1 || true
echo

echo "--- Last 15 lines: frontend ---"
docker compose logs frontend --tail 15 2>&1 || true
echo

if [[ "${failures}" -eq 0 ]]; then
  echo "Summary: all critical checks passed."
  exit 0
fi

echo "Summary: ${failures} check(s) failed."
echo "Remediate: cd ${MOODBEATS_DIR} && docker compose logs -f backend"
echo "           docker compose up -d --build"
echo "           systemctl restart caddy"
exit 1
