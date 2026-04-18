#!/usr/bin/env bash
# One-time: run the printed command ON THE VPS (as root) so this dev machine
# can ssh without a password. Public key: ~/.ssh/id_ed25519.pub
#
#   bash scripts/vps-authorize-dev-machine-key.sh

set -euo pipefail
PUB="${HOME}/.ssh/id_ed25519.pub"
if [[ ! -f "${PUB}" ]]; then
  echo "Missing ${PUB}" >&2
  exit 1
fi
KEY="$(cat "${PUB}")"
echo "Paste this entire block on the VPS as root:"
echo "---"
echo "mkdir -p ~/.ssh && chmod 700 ~/.ssh"
echo "grep -qxF '${KEY}' ~/.ssh/authorized_keys 2>/dev/null || echo '${KEY}' >> ~/.ssh/authorized_keys"
echo "chmod 600 ~/.ssh/authorized_keys"
echo "---"
echo "Then from this machine: ssh root@148.135.138.197 'hostname'"
