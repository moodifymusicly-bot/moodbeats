#!/usr/bin/env bash
# -----------------------------------------------------------------------
# Run ON the VPS as root after `docker compose up -d`.
# Writes /etc/caddy/Caddyfile and starts Caddy (TLS + reverse proxy).
#
# The host port for the Next.js container must match FRONTEND_PORT
# (see docker-compose.yml "ports" for frontend — e.g. 3000:3000 or 3001:3000).
#
#   FRONTEND_PORT=3001 bash scripts/vps-configure-caddy.sh
# -----------------------------------------------------------------------

set -euo pipefail

PUBLIC_HOST="${PUBLIC_HOST:-moodbeatz.zocomputer.io}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

cat >/etc/caddy/Caddyfile <<EOF
${PUBLIC_HOST} {
    encode zstd gzip

    handle /api/* {
        reverse_proxy 127.0.0.1:8001
    }

    handle {
        reverse_proxy 127.0.0.1:${FRONTEND_PORT}
    }
}
EOF

caddy validate --config /etc/caddy/Caddyfile
systemctl enable caddy
systemctl restart caddy
echo "Caddy is running. Test: curl -sf https://${PUBLIC_HOST}/api/health"
