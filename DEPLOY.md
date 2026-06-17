# MoodBeatz — Deploy Reference

> **Single source of truth** for all local-to-VPS deployment operations.
> All agents and team members must use this document and the scripts referenced herein.

---

## Quick Reference

### Standard Deploy Command

Run from the **project root** on your **local machine**:

```bash
cd /home/chintan/MoodBeats && bash scripts/vps-sync-deploy.sh
```

All defaults are pre-configured. Equivalent explicit form:

```bash
cd /home/chintan/MoodBeats && \
  VPS=root@ts4.zocomputer.io \
  SSH_PORT=10960 \
  REMOTE_DIR=/opt/moodbeatz \
  PUBLIC_HOST=moodbeatz.zocomputer.io \
  bash scripts/vps-sync-deploy.sh
```

> This is the **only** command needed for a full production deploy.
> It syncs code, rebuilds frontend, runs migrations, and verifies all services.

### Dry Run (preview what will be synced without deploying)

```bash
DRY_RUN=1 bash scripts/vps-sync-deploy.sh
```

### Post-Deploy Health Check (run from local, executes on VPS)

```bash
ssh -p 10960 root@ts4.zocomputer.io 'bash /opt/moodbeatz/scripts/vps-health-check.sh'
```

---

## VPS Details

| Parameter    | Value                          |
|-------------|--------------------------------|
| SSH Host     | `ts4.zocomputer.io`            |
| SSH Port     | `10960`                        |
| SSH User     | `root`                         |
| SSH Command  | `ssh -p 10960 root@ts4.zocomputer.io` |
| SSH Alias    | `ssh moodbeatz-vps`            |
| Remote path  | `/opt/moodbeatz`          |
| Public URL   | `https://moodbeatz.zocomputer.io` |

---

## What the Deploy Script Does

`scripts/vps-sync-deploy.sh` (single source of truth):

1. **Preflight** — verifies `rsync`, `ssh`, `git` are available locally; validates SSH access to VPS
2. **rsync** — syncs the local repo to `VPS:REMOTE_DIR` with smart excludes (no `node_modules`, no venvs, no `dist/`, no `.git/`)
3. **Env patching** — auto-injects `RECO_SERVICE_URL` if missing; patches `frontend/.env.production` and root `.env` with `PUBLIC_HOST` if supplied
4. **Caddy patch** — idempotently writes Caddyfile for `moodbeatz.zocomputer.io` with `/api/recommendations*` → port 8002
5. **Python deps** — updates pip packages in backend and recommendation venvs
6. **Frontend build** — `npm ci && npm run build` in `frontend/`
7. **Alembic** — runs `alembic upgrade head` (idempotent)
8. **Supervisor** — restarts all services via `supervisorctl`
9. **Health checks** — verifies backend (:8001), recommendation service (:8002), Clerk auth, env audit
10. **Summary** — coloured PASS/FAIL table with overall status

---

## Services & Ports

| Service                  | Port  | Manager                  |
|--------------------------|-------|--------------------------|
| Main backend (FastAPI)   | 8001  | supervisord (gunicorn)   |
| Recommendation service   | 8002  | supervisord (gunicorn)   |
| Frontend (Caddy)         | 443   | supervisord (caddy)      |
| PostgreSQL               | 5432  | supervisord              |
| Redis                    | 6379  | supervisord              |

Caddy (reverse proxy, ports 80/443) routes:
- `/api/recommendations*` → `:8002` (recommendation service)
- `/api/*` → `:8001` (main backend)
- `/*` → `frontend/dist/` (static file server)

---

## rsync Exclusions

The following are **never synced** to the VPS:

| Excluded path          | Reason                                  |
|------------------------|-----------------------------------------|
| `node_modules/`        | Installed on VPS via npm ci             |
| `frontend/node_modules/` | Installed on VPS via npm ci           |
| `frontend/dist/`       | Built on VPS                            |
| `backend/venv/`        | 186 MB local venv — not used on VPS    |
| `backend/.venv/`       | 7 GB local venv — not used on VPS      |
| `.venv/`, `venv/`      | Any root-level venv                     |
| `__pycache__/`, `*.pyc` | Python bytecode — regenerated          |
| `.pytest_cache/`       | Test artefacts                          |
| `.mypy_cache/`         | Type check cache                        |
| `releases/`            | Git bundles (gitignored)               |
| `UINew_backup/`        | Local UI archive, not needed on VPS    |
| `.git/`, `.cursor/`, `.gemini/` | Dev tooling             |

**`recommendation_system/`** is explicitly **included** — the standalone microservice requires it.

---

## First-Time VPS Setup

If setting up a brand new VPS, run this once **on the VPS** as root:

```bash
# 1. Copy your .env to the VPS first
scp -P 10960 /home/chintan/MoodBeats/.env root@ts4.zocomputer.io:/opt/moodbeatz/.env

# 2. Then run the one-shot bootstrap script on the VPS
ssh -p 10960 root@ts4.zocomputer.io 'bash /opt/moodbeatz/scripts/vps-native-bootstrap.sh moodbeatz.zocomputer.io'
```

---

## Useful SSH One-Liners

```bash
# Connect to VPS (with SSH config alias)
ssh moodbeatz-vps

# Check all service status
ssh moodbeatz-vps 'supervisorctl status'

# Tail all service logs
ssh moodbeatz-vps 'tail -f /var/log/moodbeatz/*.log'

# Tail only backend logs
ssh moodbeatz-vps 'supervisorctl tail -f moodbeatz-backend'

# Tail only recommendation service logs
ssh moodbeatz-vps 'supervisorctl tail -f moodbeatz-recommendation'

# Restart a single service without full redeploy
ssh moodbeatz-vps 'supervisorctl restart moodbeatz-backend'
ssh moodbeatz-vps 'supervisorctl restart moodbeatz-recommendation'

# Check backend API health (from laptop)
curl -s https://moodbeatz.zocomputer.io/api/health

# Check recommendation service (anon discover feed)
curl -s https://moodbeatz.zocomputer.io/api/recommendations/discover | head -c 200

# Run Alembic migrations manually
ssh moodbeatz-vps 'cd /opt/moodbeatz/backend && .venv/bin/python -m alembic upgrade head'

# Run full health check on VPS
ssh moodbeatz-vps 'bash /opt/moodbeatz/scripts/vps-health-check.sh'
```

---

## Environment Variables

### Required in root `.env` (VPS)

| Key                   | Description                              |
|-----------------------|------------------------------------------|
| `POSTGRES_USER`       | DB username                              |
| `POSTGRES_PASSWORD`   | DB password (auto-generated if placeholder) |
| `POSTGRES_DB`         | DB name                                  |
| `REDIS_PASSWORD`      | Redis auth password                      |
| `CLERK_SECRET_KEY`    | Clerk secret (`sk_live_...`)             |
| `CLERK_ISSUER`        | Clerk tenant URL                         |
| `CLERK_JWKS_URL`      | Clerk JWKS endpoint                      |
| `YOUTUBE_API_KEY`     | YouTube Data API v3 key                  |
| `ALLOWED_ORIGINS`     | Comma-separated CORS origins             |
| `RECO_SERVICE_URL`    | `http://127.0.0.1:8002` (auto-injected)  |
| `ENABLE_V2_SCORING`   | `true` to activate v2 circumplex scoring |
| `FAISS_ENABLED`       | `true` to enable ANN index acceleration  |

### Required in `frontend/.env.production` (local, baked into build)

| Key                          | Value                                        |
|------------------------------|----------------------------------------------|
| `VITE_API_URL`               | `https://moodbeatz.zocomputer.io`            |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (`pk_live_...`)        |

> **Note**: These are baked at build time via Vite. They must be set correctly **before** running the deploy script.

---

## Script Inventory

| Script                          | Purpose                                                        | Where to run |
|---------------------------------|----------------------------------------------------------------|--------------|
| `scripts/vps-sync-deploy.sh`    | **Canonical deploy** — rsync + build + verify                 | Local        |
| `scripts/vps-health-check.sh`   | Full stack health check (all 5 services + Caddy + HTTPS)      | VPS or local |
| `scripts/vps-native-bootstrap.sh` | First-time VPS bootstrap (PG, Redis, Caddy, venvs, supervisor) | VPS (root)   |
| `scripts/vps-configure-caddy.sh`| Re-write/reload Caddyfile only                                | VPS (root)   |
| `scripts/vps-diagnose-remote-access.sh` | Diagnose network/firewall/Caddy issues             | VPS (root)   |
| `scripts/vps-authorize-dev-machine-key.sh` | Copy local SSH key to VPS for passwordless auth  | Local        |
| `scripts/start-local-stack.sh`  | Start full stack locally (dev mode)                           | Local        |

---

## Agent Policy

> **All automation must use `scripts/vps-sync-deploy.sh` for production deploys.**
> Do not create alternative deploy scripts. If deploy behaviour needs to change, update `vps-sync-deploy.sh` in place and log the change in `log.md`.
