#!/usr/bin/env bash
set -euo pipefail

PUBLIC_HOST="187.127.181.204.nip.io"
MOODBEATZ_DIR="/opt/moodbeatz"

# Source .env
set -a
source "${MOODBEATZ_DIR}/.env"
set +a

PG_USER="${POSTGRES_USER:-moodmusic}"
PG_PASS="${POSTGRES_PASSWORD:-moodmusic_secret}"
PG_DB="${POSTGRES_DB:-moodmusic}"
REDIS_PASS="${REDIS_PASSWORD:-change-me-redis-password}"

# Use Conda python
PYTHON_BIN="/opt/miniconda/envs/py311/bin/python"
PIP_BIN="/opt/miniconda/envs/py311/bin/pip"

# 3. Python venvs (using conda environment instead)
echo "Setting up Python dependencies..."
cd "${MOODBEATZ_DIR}"
${PIP_BIN} install -q -r backend/requirements.txt || echo "backend pip install failed, but continuing..."
${PIP_BIN} install -q -r recommendation_system/requirements.txt || echo "reco pip install failed, but continuing..."

# 4. Frontend build
echo "Building frontend..."
cd "${MOODBEATZ_DIR}/frontend"
npm install --silent
echo "VITE_API_URL=https://${PUBLIC_HOST}" > .env.production
npm run build

# 5. Caddy config
echo "Configuring Caddy..."
cat > /etc/caddy/Caddyfile <<CADDYEOF
${PUBLIC_HOST} {
    encode zstd gzip

    handle /api/recommendations* {
        reverse_proxy 127.0.0.1:8002
    }

    handle /api/* {
        reverse_proxy 127.0.0.1:8001
    }

    handle {
        root * ${MOODBEATZ_DIR}/frontend/dist
        try_files {path} /index.html
        file_server
    }
}
CADDYEOF
systemctl start caddy
systemctl enable caddy
systemctl reload caddy

# 6. Supervisord config for backend services
echo "Configuring Supervisord..."
cat > "${MOODBEATZ_DIR}/.env.native" <<ENVEOF
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

mkdir -p /var/moodbeatz/faiss /var/log/moodbeatz

cat > /etc/supervisord.d/moodbeatz.ini <<SUPEOF
[program:moodbeatz-backend]
command=${PYTHON_BIN} -m gunicorn app.main:app --bind 127.0.0.1:8001 --workers 4 --worker-class uvicorn.workers.UvicornWorker --timeout 120
directory=${MOODBEATZ_DIR}/backend
environment=DATABASE_URL="postgresql+asyncpg://${PG_USER}:${PG_PASS}@127.0.0.1:5432/${PG_DB}",REDIS_URL="redis://:${REDIS_PASS}@127.0.0.1:6379/0",RECO_SERVICE_URL="http://127.0.0.1:8002",ENVIRONMENT="production",ALLOWED_ORIGINS="https://${PUBLIC_HOST}"
autostart=true
autorestart=true
stdout_logfile=/var/log/moodbeatz/backend.log
stderr_logfile=/var/log/moodbeatz/backend-error.log

[program:moodbeatz-recommendation]
command=${PYTHON_BIN} -m gunicorn recommendation_system.main:app --bind 127.0.0.1:8002 --workers 2 --worker-class uvicorn.workers.UvicornWorker --timeout 120
directory=${MOODBEATZ_DIR}
environment=DATABASE_URL="postgresql+asyncpg://${PG_USER}:${PG_PASS}@127.0.0.1:5432/${PG_DB}",REDIS_URL="redis://:${REDIS_PASS}@127.0.0.1:6379/0",FAISS_ENABLED="true",PYTHONPATH="${MOODBEATZ_DIR}/backend:${MOODBEATZ_DIR}"
autostart=true
autorestart=true
stdout_logfile=/var/log/moodbeatz/recommendation.log
stderr_logfile=/var/log/moodbeatz/recommendation-error.log
SUPEOF

# Make sure supervisord includes .ini files
if ! grep -q "^\[include\]" /etc/supervisord.conf; then
    echo -e "\n[include]\nfiles = /etc/supervisord.d/*.ini" >> /etc/supervisord.conf
fi

systemctl start supervisord
systemctl enable supervisord
supervisorctl reread || true
supervisorctl update || true
supervisorctl restart all || true

# 7. Migrations
cd "${MOODBEATZ_DIR}/backend"
DATABASE_URL="postgresql+asyncpg://${PG_USER}:${PG_PASS}@127.0.0.1:5432/${PG_DB}" ${PYTHON_BIN} -m alembic upgrade head || echo "Migrations failed but continuing..."

echo "Deployment complete!"
