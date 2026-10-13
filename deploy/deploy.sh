#!/usr/bin/env bash
# ==============================================================================
# deploy/deploy.sh — Zero-Downtime Deployment Runner for Hostinger VPS
# Handles: git pull -> deps -> migrations -> build -> PM2 reload -> health check
# Automatically rolls back if post-deployment health check fails.
# ==============================================================================

set -euo pipefail

APP_ROOT="/var/www/o3-car-spaa"
API_URL="http://127.0.0.1:5000/api/health"

echo "=================================================================="
echo "🚀 INITIATING ZERO-DOWNTIME PRODUCTION DEPLOYMENT"
echo "=================================================================="

cd "${APP_ROOT}"

# ── 1. Pre-Flight Checks ─────────────────────────────────────────────────────
echo "🔍 [1/6] Running pre-flight checks..."

if [ ! -f "${APP_ROOT}/.env" ] && [ ! -f "${APP_ROOT}/server/.env" ]; then
    echo "❌ ERROR: .env file missing in ${APP_ROOT} or ${APP_ROOT}/server" >&2
    exit 1
fi

PREV_COMMIT=$(git rev-parse HEAD)
echo "   Current active commit: ${PREV_COMMIT}"

# ── 2. Update Codebase ───────────────────────────────────────────────────────
echo "📥 [2/6] Pulling latest changes from git repository..."
git fetch origin main
git pull origin main

NEW_COMMIT=$(git rev-parse HEAD)
echo "   Target commit: ${NEW_COMMIT}"

# ── 3. Install Dependencies ──────────────────────────────────────────────────
echo "📦 [3/6] Installing server and client dependencies..."
npm install --prefix server --omit=dev --no-audit
npm install --prefix client --no-audit

# ── 4. Run Versioned Database Migrations ──────────────────────────────────────
echo "🗄️ [4/6] Executing database migrations..."
npm run db:migrate --prefix server

# ── 5. Build Client Production Bundle ────────────────────────────────────────
echo "⚡ [5/6] Building production frontend with Vite..."
npm run build --prefix client

# ── 6. Zero-Downtime PM2 Cluster Reload & Verification ───────────────────────
echo "🔄 [6/6] Reloading PM2 application cluster with zero downtime..."

if pm2 describe o3-car-spaa-api > /dev/null 2>&1; then
    pm2 reload ecosystem.config.js --env production
else
    pm2 start ecosystem.config.js --env production
fi

# Save PM2 process list to resurrect on reboot
pm2 save

echo "⏳ Waiting for cluster warm-up and verifying /api/health..."
HEALTHY=false
for i in {1..12}; do
    sleep 2
    STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}" || true)
    if [ "${STATUS_CODE}" -eq 200 ]; then
        HEALTHY=true
        echo "   ✓ Health probe passed on attempt #${i} (HTTP 200 OK)"
        break
    else
        echo "   ... Health probe attempt #${i}: HTTP ${STATUS_CODE} (retrying)"
    fi
done

if [ "${HEALTHY}" = true ]; then
    echo "=================================================================="
    echo "🎉 DEPLOYMENT SUCCEEDED! Live Commit: ${NEW_COMMIT}"
    echo "=================================================================="
    exit 0
else
    echo "=================================================================="
    echo "❌ DEPLOYMENT FAILED: Healthcheck did not return HTTP 200!"
    echo "🔄 Initiating automatic emergency rollback to: ${PREV_COMMIT}..."
    echo "=================================================================="
    git reset --hard "${PREV_COMMIT}"
    npm install --prefix client
    npm run build --prefix client
    pm2 reload ecosystem.config.js --env production
    echo "Rollback completed. Please inspect logs with: pm2 logs o3-car-spaa-api"
    exit 1
fi
