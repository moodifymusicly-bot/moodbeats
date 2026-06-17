#!/usr/bin/env bash
# ============================================================================
# MoodBeatz Single-Command Deployment Script (deploy.sh)
#
# Follows the strict standard:
# 1. Backup to GitHub (Pre-deploy)
# 2. Deep Clean (Remove unused/stale dependencies locally & remotely)
# 3. Deploy & Build (Rsync, fresh install, build)
# 4. Start & Verify (Restart services, health checks)
# 5. Final Confirmation & Post-deploy GitHub Backup
# ============================================================================

set -e

# --- Configuration ---
VPS="${VPS:-root@187.127.181.204}"
REMOTE_DIR="/opt/moodbeatz"
PUBLIC_HOST="${PUBLIC_HOST:-187.127.181.204.nip.io}"
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
SSH_PORT="${SSH_PORT:-22}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}Starting automated deployment pipeline for MoodBeatz...${NC}\n"

# ----------------------------------------------------------------------------
# Step 1: Backup to GitHub (Pre-Deploy)
# ----------------------------------------------------------------------------
echo -e "${YELLOW}==> Step 1: Backing up current state to GitHub...${NC}"
git add .
if git commit -m "chore: backup pre-deployment state ($(date +'%Y-%m-%d %H:%M:%S'))"; then
    echo "Changes committed."
else
    echo "No changes to commit for pre-deploy."
fi
echo "Pushing to origin/${BRANCH}..."
git push origin "${BRANCH}" || { echo -e "${RED}Failed to push to GitHub. Check your network or credentials.${NC}"; exit 1; }
echo -e "${GREEN}Backup complete.${NC}\n"

# ----------------------------------------------------------------------------
# Step 2: Clean Up
# ----------------------------------------------------------------------------
echo -e "${YELLOW}==> Step 2: Cleaning up stale dependencies...${NC}"
echo "Removing local node_modules and .venv directories to ensure a fresh state..."
rm -rf frontend/node_modules
rm -rf frontend/dist
rm -rf backend/.venv
rm -rf recommendation_system/.venv

echo "Removing remote node_modules and .venv directories on ${VPS}..."
ssh -p "${SSH_PORT}" "${VPS}" "rm -rf ${REMOTE_DIR}/frontend/node_modules ${REMOTE_DIR}/frontend/dist ${REMOTE_DIR}/backend/.venv ${REMOTE_DIR}/recommendation_system/.venv" || true
echo -e "${GREEN}Clean up complete.${NC}\n"

# ----------------------------------------------------------------------------
# Step 3: Deployment
# ----------------------------------------------------------------------------
echo -e "${YELLOW}==> Step 3: Deploying code and installing dependencies fresh...${NC}"
ssh -p "${SSH_PORT}" "${VPS}" "mkdir -p ${REMOTE_DIR}"

echo "Syncing files to VPS via rsync..."
rsync -az --delete \
  -e "ssh -p ${SSH_PORT}" \
  --exclude ".git/" \
  --exclude ".cursor/" \
  --exclude ".gemini/" \
  --exclude "node_modules/" \
  --exclude ".venv/" \
  --exclude "__pycache__/" \
  --exclude "*.pyc" \
  ./ "${VPS}:${REMOTE_DIR}/"

REMOTE_PAYLOAD="${REMOTE_DIR}/.deploy-execute.sh"
echo "Creating remote payload script..."

ssh -p "${SSH_PORT}" "${VPS}" "cat > '${REMOTE_PAYLOAD}'" <<'EOF_REMOTE'
#!/usr/bin/env bash
set -e
DIR="/opt/moodbeatz"
PUBLIC_HOST=$1

cd "$DIR"

echo "--> Backend: Creating fresh virtual environment and installing deps..."
python3.11 -m venv backend/.venv || python3 -m venv backend/.venv
backend/.venv/bin/pip install --upgrade pip
backend/.venv/bin/pip install -r backend/requirements.txt

echo "--> Recommendation System: Creating fresh virtual environment and installing deps..."
python3.11 -m venv recommendation_system/.venv || python3 -m venv recommendation_system/.venv
recommendation_system/.venv/bin/pip install --upgrade pip
recommendation_system/.venv/bin/pip install -r recommendation_system/requirements.txt

echo "--> Frontend: Installing deps and building..."
cd frontend
npm install
npm run build
cd ..

echo "--> Configuring environment variables..."
if [[ ! -f .env ]]; then
    if [[ -f .env.example ]]; then
        cp .env.example .env
        echo "Created .env from .env.example. PLEASE REVIEW SECRETS LATER."
    else
        touch .env
    fi
fi

# Ensure API URL is set correctly for frontend build if needed, though we already built it.
# If Vite requires it at build time, we should inject it before build. Since we already synced, 
# we rely on the .env file having correct VITE_API_URL.

# Update ALLOWED_ORIGINS in .env
if ! grep -q "^ALLOWED_ORIGINS=" .env; then
    echo "ALLOWED_ORIGINS=https://${PUBLIC_HOST}" >> .env
else
    sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=https://${PUBLIC_HOST}|" .env
fi

EOF_REMOTE

echo "Executing remote payload on VPS..."
ssh -p "${SSH_PORT}" "${VPS}" "bash '${REMOTE_PAYLOAD}' '${PUBLIC_HOST}'"
echo -e "${GREEN}Deployment and installation complete.${NC}\n"

# ----------------------------------------------------------------------------
# Step 4: Start & Verify
# ----------------------------------------------------------------------------
echo -e "${YELLOW}==> Step 4: Starting services and verifying...${NC}"

ssh -p "${SSH_PORT}" "${VPS}" "cat > /tmp/caddy-update.sh" <<'EOF_CADDY'
#!/usr/bin/env bash
set -e
DIR="/opt/moodbeatz"
PUBLIC_HOST=$1

echo "--> Configuring Caddy for domain: ${PUBLIC_HOST}"
cat > /etc/caddy/Caddyfile <<CEOF
${PUBLIC_HOST} {
    encode zstd gzip
    handle /api/recommendations* {
        reverse_proxy 127.0.0.1:8002
    }
    handle /api/* {
        reverse_proxy 127.0.0.1:8001
    }
    handle {
        root * ${DIR}/frontend/dist
        try_files {path} /index.html
        file_server
    }
}
CEOF

systemctl restart caddy || true
EOF_CADDY

ssh -p "${SSH_PORT}" "${VPS}" "bash /tmp/caddy-update.sh '${PUBLIC_HOST}'"

echo "Restarting application services via supervisord..."
ssh -p "${SSH_PORT}" "${VPS}" "supervisorctl reread || true; supervisorctl update || true; supervisorctl restart moodbeatz-backend moodbeatz-recommendation"

echo "Waiting for services to start..."
sleep 5

echo "Running health checks..."
ssh -p "${SSH_PORT}" "${VPS}" "curl -sf http://127.0.0.1:8001/api/health > /dev/null && echo 'Backend [OK]' || echo 'Backend [FAIL]'"
ssh -p "${SSH_PORT}" "${VPS}" "curl -sf http://127.0.0.1:8002/api/health > /dev/null && echo 'Recommendation [OK]' || echo 'Recommendation [FAIL]'"

echo -e "${GREEN}Start and Verify complete.${NC}\n"

# ----------------------------------------------------------------------------
# Step 5: Final Notes & Confirmation
# ----------------------------------------------------------------------------
echo -e "${YELLOW}==> Step 5: Final Summary & Confirmation${NC}"
echo -e "Deployment is now live!"
echo -e "URL: ${BOLD}https://${PUBLIC_HOST}${NC}"
echo -e "Please open this URL in your browser and verify everything works as expected."
echo ""
read -p "Press [ENTER] to confirm the deployment is working and push the final state to GitHub, or Ctrl+C to abort..."

echo "Pushing post-deployment state to GitHub..."
git add .
if git commit -m "chore: backup post-deployment state ($(date +'%Y-%m-%d %H:%M:%S'))"; then
    git push origin "${BRANCH}"
    echo -e "${GREEN}Final state backed up. Deployment successfully finished!${NC}"
else
    echo -e "${GREEN}No additional changes to push. Deployment successfully finished!${NC}"
fi
