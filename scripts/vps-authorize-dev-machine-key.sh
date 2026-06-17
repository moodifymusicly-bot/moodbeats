#!/usr/bin/env bash
# ============================================================================
# Copy your SSH public key to the VPS for passwordless authentication.
#
# Usage:
#   bash scripts/vps-authorize-dev-machine-key.sh
#   VPS=root@myhost.com SSH_PORT=22 bash scripts/vps-authorize-dev-machine-key.sh
#
# After running this, all future SSH/rsync connections (including
# vps-sync-deploy.sh) will be passwordless.
# ============================================================================

set -euo pipefail

VPS="${VPS:-root@ts4.zocomputer.io}"
SSH_PORT="${SSH_PORT:-10960}"

# Find the best available public key
PUB=""
for candidate in "${HOME}/.ssh/id_ed25519.pub" "${HOME}/.ssh/id_rsa.pub" "${HOME}/.ssh/id_ecdsa.pub"; do
  if [[ -f "${candidate}" ]]; then
    PUB="${candidate}"
    break
  fi
done

if [[ -z "${PUB}" ]]; then
  echo "No SSH public key found. Generating one..."
  ssh-keygen -t ed25519 -f "${HOME}/.ssh/id_ed25519" -N "" -C "$(whoami)@$(hostname)"
  PUB="${HOME}/.ssh/id_ed25519.pub"
fi

echo "==> Using key: ${PUB}"
echo "==> Copying to ${VPS} (port ${SSH_PORT})..."
echo "    (you will be prompted for the VPS password ONE LAST TIME)"
echo ""

ssh-copy-id -i "${PUB}" -p "${SSH_PORT}" -o StrictHostKeyChecking=accept-new "${VPS}"

echo ""
echo "==> Done! Testing passwordless connection..."
if ssh -p "${SSH_PORT}" -o StrictHostKeyChecking=accept-new "${VPS}" "echo 'Passwordless SSH works!'"; then
  echo ""
  echo "SUCCESS: Future deploys will not ask for a password."
  echo "  Test: ssh -p ${SSH_PORT} ${VPS} hostname"
else
  echo ""
  echo "WARNING: Passwordless connection test failed."
  echo "  You may need to manually add the key on the VPS."
  echo "  Key content:"
  cat "${PUB}"
fi
