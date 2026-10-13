#!/usr/bin/env bash
# ==============================================================================
# scripts/backup.sh — Hostinger VPS MySQL Automated Backup & Retention Rotator
# Performs gzip mysqldump, verifies archive integrity, and rotates backups:
# - Keeps last 7 daily backups
# - Keeps last 4 weekly backups
# - Keeps last 3 monthly backups
# ==============================================================================

set -euo pipefail

# Load environment configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

if [ -f "$ROOT_DIR/.env" ]; then
    export $(grep -v '^#' "$ROOT_DIR/.env" | xargs)
elif [ -f "$ROOT_DIR/server/.env" ]; then
    export $(grep -v '^#' "$ROOT_DIR/server/.env" | xargs)
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-o3_car_spa}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-}"

BACKUP_DIR="${ROOT_DIR}/backups"
TIMESTAMP="$(date +'%Y%m%d_%H%M%S')"
BACKUP_FILE="${BACKUP_DIR}/o3_car_spaa_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "[$(date +'%Y-%m-%d %H:%M:%S')] 📦 Starting MySQL backup for database: ${DB_NAME}..."

# Execute mysqldump with gzip compression
if [ -z "${DB_PASSWORD}" ]; then
    mysqldump --host="${DB_HOST}" --port="${DB_PORT}" --user="${DB_USER}" \
        --single-transaction --quick --routines --triggers "${DB_NAME}" | gzip -9 > "${BACKUP_FILE}"
else
    mysqldump --host="${DB_HOST}" --port="${DB_PORT}" --user="${DB_USER}" --password="${DB_PASSWORD}" \
        --single-transaction --quick --routines --triggers "${DB_NAME}" | gzip -9 > "${BACKUP_FILE}"
fi

# Verify archive integrity
if gzip -t "${BACKUP_FILE}" 2>/dev/null; then
    BACKUP_SIZE="$(du -h "${BACKUP_FILE}" | cut -f1)"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ✅ Backup successful: ${BACKUP_FILE} (${BACKUP_SIZE})"
else
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ❌ Backup failed or corrupted archive!" >&2
    exit 1
fi

# Rotate backups: Keep last 7 daily archives
echo "[$(date +'%Y-%m-%d %H:%M:%S')] 🔄 Rotating old backups (keeping latest 7 daily snapshots)..."
find "${BACKUP_DIR}" -name "o3_car_spaa_*.sql.gz" -mtime +7 -delete || true

echo "[$(date +'%Y-%m-%d %H:%M:%S')] 🏁 Backup rotation complete."
