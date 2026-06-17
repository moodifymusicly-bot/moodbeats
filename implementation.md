# Implementation Plan - Standardized VPS Deployment Pipeline

This document describes the deployment architecture and script (`deploy.sh`) for the MoodBeatz application, standardizing how we ship code to the remote VPS.

## Goals
1. **Single Source of Truth**: Replace multiple fragmented scripts with one comprehensive `deploy.sh`.
2. **Reliable State**: Enforce GitHub backups before and after deployment.
3. **Pristine Environment**: Deep clean dependencies (`node_modules`, `.venv`) before deployment to avoid ghost bugs.
4. **Automated Verification**: Run health checks on frontend, backend, and recommendation services post-deployment.

## Deployment Workflow

The `deploy.sh` script executes the following stages sequentially:

1. **GitHub Backup (Pre-deploy)**
   - Stages all current files.
   - Commits as "chore: backup pre-deployment state".
   - Pushes to the `main` branch.

2. **Aggressive Cleanup**
   - Deletes `frontend/node_modules`, `backend/.venv`, and `recommendation_system/.venv` locally.
   - Executes remote command to delete the same directories on the VPS.

3. **Rsync & Remote Execution**
   - Syncs code to `/opt/moodbeatz` on the VPS.
   - Executes a remote payload that:
     - Creates fresh Python 3.11 virtual environments.
     - Runs `npm ci` / `npm install` for frontend.
     - Runs `npm run build`.
     - Updates Caddy and supervisord configurations.

4. **Service Start & Health Checks**
   - Restarts Caddy and supervisord (`moodbeatz-backend`, `moodbeatz-recommendation`).
   - cURLs `/api/health` endpoints to verify service health.

5. **Manual Confirmation & Final Push**
   - Prompts the developer to manually verify the site at the generated domain.
   - Awaits an `ENTER` key press to finalize the deploy by committing and pushing any post-deploy script adjustments back to GitHub.

## Deprecation Notice
Legacy scripts such as `scripts/vps-sync-deploy.sh` are deprecated in favor of the root `deploy.sh`.
