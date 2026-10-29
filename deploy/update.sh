#!/usr/bin/env bash
# Pulls the latest code, rebuilds, and restarts the server. The display reloads itself.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
git pull --ff-only
pnpm install --frozen-lockfile
pnpm build
sudo systemctl restart officeboard.service
echo "Updated. Check status with: systemctl status officeboard"
