#!/usr/bin/env bash
# ==============================================================================
# deploy/rollback.sh — One-Click Rollback Runner for Hostinger VPS
# Restores previous Git commit and initiates graceful PM2 cluster reload.
# ==============================================================================

set -euo pipefail

APP_ROOT="/var/www/o3-car-spaa"
TARGET_COMMIT="${1:-HEAD~1}"

echo "=================================================================="
echo "⏪ INITIATING PRODUCTION ROLLBACK"
echo "Target Commit: ${TARGET_COMMIT}"
echo "=================================================================="

cd "${APP_ROOT}"

echo "🔄 [1/4] Reverting git repository to ${TARGET_COMMIT}..."
git reset --hard "${TARGET_COMMIT}"

echo "📦 [2/4] Installing dependencies for restored state..."
npm install --prefix server --omit=dev --no-audit
npm install --prefix client --no-audit

echo "⚡ [3/4] Rebuilding client static bundle..."
npm run build --prefix client

echo "🔄 [4/4] Reloading PM2 application cluster..."
pm2 reload ecosystem.config.js --env production

echo "⏳ Verifying health endpoint..."
sleep 3
curl -s http://127.0.0.1:5000/api/health | jq . || curl -s http://127.0.0.1:5000/api/health

echo "=================================================================="
echo "✅ ROLLBACK COMPLETED SUCCESSFULLY!"
echo "Active Commit: $(git rev-parse HEAD)"
echo "=================================================================="
