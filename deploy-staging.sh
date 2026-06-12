#!/bin/bash
# Deploy the staging frontend.
# Run from the repo root on toaster: ./deploy-staging.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "==> Pulling latest changes..."
git pull

echo "==> Rebuilding and restarting staging container..."
docker compose -f docker-compose.staging.yml --env-file .env.staging down --remove-orphans
docker compose -f docker-compose.staging.yml --env-file .env.staging up -d --build

echo "==> Done. Staging is running on port 3001."
