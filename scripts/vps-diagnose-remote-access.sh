#!/usr/bin/env bash
# -----------------------------------------------------------------------
# Run ON the VPS (SSH) when the site does not load in the browser.
# Diagnoses: cloud firewall vs local services vs Caddy/TLS.
#
#   bash /opt/moodbeatz/scripts/vps-diagnose-remote-access.sh
# -----------------------------------------------------------------------

set -u

MOODBEATZ_DIR="${MOODBEATZ_DIR:-/opt/moodbeatz}"
PUBLIC_HOST="${PUBLIC_HOST:-148.135.138.197.nip.io}"

echo "=============================================="
echo " MoodBeatz — remote access diagnosis"
echo "=============================================="
echo

echo "=== 1) This machine's IPs (compare with DNS for ${PUBLIC_HOST}) ==="
hostname -I 2>/dev/null || true
ip -4 addr show scope global 2>/dev/null | awk '/inet / {print $2}' || true
echo "Expected: 148.135.138.197 should appear if this is the public VPS."
echo

echo "=== 2) Listening ports (need :80 :443 for Caddy; :3000 :8001 for app) ==="
if command -v ss &>/dev/null; then
  ss -tlnp | grep -E ':80 |:443 |:3000|:8001' || echo "(no matches — services may be down)"
else
  netstat -tlnp 2>/dev/null | grep -E ':80 |:443 |:3000|:8001' || true
fi
echo

echo "=== 3) UFW (host firewall — must allow 22, 80, 443) ==="
if command -v ufw &>/dev/null; then
  ufw status verbose || true
else
  echo "ufw not installed"
fi
echo

echo "=== 4) Caddy ==="
if command -v systemctl &>/dev/null; then
  systemctl is-active caddy 2>/dev/null || true
  systemctl status caddy --no-pager -l 2>/dev/null | head -25
else
  echo "systemctl unavailable"
fi
echo

if [[ -f /etc/caddy/Caddyfile ]]; then
  echo "=== /etc/caddy/Caddyfile (first 40 lines) ==="
  head -40 /etc/caddy/Caddyfile
  echo
fi

echo "=== 5) Docker stack ==="
if [[ -d "${MOODBEATZ_DIR}" ]]; then
  (cd "${MOODBEATZ_DIR}" && docker compose ps 2>&1) || true
else
  echo "Missing ${MOODBEATZ_DIR}"
fi
echo

echo "=== 6) Local curls (must succeed for Caddy to work) ==="
curl -sf --max-time 3 http://127.0.0.1:8001/api/health && echo "  <- backend OK" || echo "BACKEND FAIL: http://127.0.0.1:8001/api/health"
curl -sf -o /dev/null -w "frontend HTTP %{http_code}\n" --max-time 3 http://127.0.0.1:3000 || echo "FRONTEND FAIL: http://127.0.0.1:3000"
echo

echo "=== 7) HTTPS to self (public name from inside VPS) ==="
curl -sfI --max-time 10 "https://${PUBLIC_HOST}/" | head -8 || echo "HTTPS to ${PUBLIC_HOST} failed from this host (TLS/DNS/Caddy)."
echo

echo "=============================================="
echo " If steps 6 are OK but your browser still cannot load the site,"
echo " open INBOUND TCP 80 and 443 in your cloud provider's firewall"
echo " (security group / network rules). UFW alone is not enough if"
echo " the provider drops traffic before it reaches this server."
echo "=============================================="
