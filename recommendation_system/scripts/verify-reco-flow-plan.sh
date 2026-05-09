#!/usr/bin/env bash
# Run automated checks for the "verify plays, recommendations, playlists" plan.
# Usage (from repo root): bash scripts/verify-reco-flow-plan.sh
# Optional: with local stack up, pass --sql to probe Postgres for play interactions.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"

echo "==> pytest: plan verification (API contracts + localStorage key in source)"
uv run pytest tests/test_plan_verify_reco_flow.py -v

if [[ "${1:-}" == "--sql" ]]; then
  echo "==> optional: SQL sample (requires docker compose and db service)"
  if docker compose -f "$ROOT/docker-compose.yml" ps db 2>/dev/null | grep -q moodbeatz-db; then
    docker compose -f "$ROOT/docker-compose.yml" exec -T db \
      psql -U "${POSTGRES_USER:-moodmusic}" -d "${POSTGRES_DB:-moodmusic}" \
      -c "SELECT interaction_type, COUNT(*) FROM interactions GROUP BY 1 ORDER BY 1;" \
      || true
  else
    echo "    (skip: db container not running — start stack with docker compose up -d)"
  fi
fi

echo "==> done. For full manual E2E: sign in (Clerk), play a track, watch Network for POST .../interact"
