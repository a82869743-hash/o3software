#!/usr/bin/env bash
# ==============================================================================
# scripts/backup.sh — O3 Car Spaa database + uploads backup (Hostinger VPS)
#
#   • gzip mysqldump of the whole database (consistent snapshot, no table locks)
#   • tar.gz of server/uploads (job card photos, service pictures, QR codes, banners)
#   • keeps: last 14 daily · last 8 weekly (Sunday) · last 12 monthly (1st of month)
#   • optional off-server copy with rclone (Google Drive / S3 / Backblaze …):
#       set BACKUP_REMOTE in server/.env, e.g.  BACKUP_REMOTE=gdrive:o3-backups
#   • writes backups/LAST_BACKUP_OK with the time of the last good run (checked by /api/health)
#
# Run by cron (deploy/crontab.txt). Restore: see RUNBOOK.md → "Restore a backup".
# ==============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Read only the keys we need from .env (values may contain spaces / quotes / < > — never "export $(...)")
env_get() {
  local key="$1" file
  for file in "$ROOT_DIR/server/.env" "$ROOT_DIR/.env"; do
    [ -f "$file" ] || continue
    local line
    line="$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n 1 || true)"
    if [ -n "$line" ]; then
      line="${line#*=}"; line="${line%$'\r'}"
      line="${line#\"}"; line="${line%\"}"; line="${line#\'}"; line="${line%\'}"
      printf '%s' "$line"; return 0
    fi
  done
  return 0
}

DB_HOST="$(env_get DB_HOST)";         DB_HOST="${DB_HOST:-localhost}"
DB_PORT="$(env_get DB_PORT)";         DB_PORT="${DB_PORT:-3306}"
DB_NAME="$(env_get DB_NAME)";         DB_NAME="${DB_NAME:-o3_car_spa}"
DB_USER="$(env_get DB_USER)";         DB_USER="${DB_USER:-root}"
export MYSQL_PWD="$(env_get DB_PASSWORD)"     # password via env, not visible in `ps`
BACKUP_REMOTE="$(env_get BACKUP_REMOTE)"

BACKUP_DIR="${ROOT_DIR}/backups"
mkdir -p "${BACKUP_DIR}/daily" "${BACKUP_DIR}/weekly" "${BACKUP_DIR}/monthly"
TS="$(date +'%Y%m%d_%H%M%S')"
DB_FILE="${BACKUP_DIR}/daily/o3_car_spaa_${TS}.sql.gz"
UP_FILE="${BACKUP_DIR}/daily/o3_uploads_${TS}.tar.gz"
log() { echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"; }
fail() { log "❌ $*" >&2; exit 1; }

log "📦 Backing up database ${DB_NAME}…"
mysqldump --host="${DB_HOST}" --port="${DB_PORT}" --user="${DB_USER}" \
  --single-transaction --quick --routines --triggers --events --no-tablespaces \
  --default-character-set=utf8mb4 "${DB_NAME}" | gzip -9 > "${DB_FILE}.part"
STATUS=("${PIPESTATUS[@]}")
[ "${STATUS[0]}" -eq 0 ] || { rm -f "${DB_FILE}.part"; fail "mysqldump failed (exit ${STATUS[0]})"; }
gzip -t "${DB_FILE}.part" 2>/dev/null || { rm -f "${DB_FILE}.part"; fail "database archive is corrupted"; }
# a real dump ends with "-- Dump completed"
zcat "${DB_FILE}.part" | tail -n 3 | grep -q "Dump completed" || { rm -f "${DB_FILE}.part"; fail "database dump is incomplete"; }
mv "${DB_FILE}.part" "${DB_FILE}"
log "✅ Database: ${DB_FILE} ($(du -h "${DB_FILE}" | cut -f1))"

UPLOADS_DIR="${ROOT_DIR}/server/uploads"
if [ -d "${UPLOADS_DIR}" ]; then
  tar -czf "${UP_FILE}.part" -C "${ROOT_DIR}/server" uploads || fail "uploads archive failed"
  tar -tzf "${UP_FILE}.part" > /dev/null 2>&1 || fail "uploads archive is corrupted"
  mv "${UP_FILE}.part" "${UP_FILE}"
  log "✅ Uploads: ${UP_FILE} ($(du -h "${UP_FILE}" | cut -f1))"
fi

# weekly (Sunday) and monthly (1st) keep-copies
if [ "$(date +%u)" = "7" ]; then cp "${DB_FILE}" "${BACKUP_DIR}/weekly/"; [ -f "${UP_FILE}" ] && cp "${UP_FILE}" "${BACKUP_DIR}/weekly/"; fi
if [ "$(date +%d)" = "01" ]; then cp "${DB_FILE}" "${BACKUP_DIR}/monthly/"; [ -f "${UP_FILE}" ] && cp "${UP_FILE}" "${BACKUP_DIR}/monthly/"; fi

# retention (by count, newest kept)
keep() { # dir pattern count
  ls -1t "$1"/$2 2>/dev/null | tail -n +$(( $3 + 1 )) | xargs -r rm -f
}
keep "${BACKUP_DIR}/daily"   "o3_car_spaa_*.sql.gz" 28   # twice a day → 14 days
keep "${BACKUP_DIR}/daily"   "o3_uploads_*.tar.gz"  14
keep "${BACKUP_DIR}/weekly"  "o3_car_spaa_*.sql.gz" 8
keep "${BACKUP_DIR}/weekly"  "o3_uploads_*.tar.gz"  8
keep "${BACKUP_DIR}/monthly" "o3_car_spaa_*.sql.gz" 12
keep "${BACKUP_DIR}/monthly" "o3_uploads_*.tar.gz"  12

# off-server copy (protects against losing the whole VPS)
if [ -n "${BACKUP_REMOTE}" ]; then
  if command -v rclone > /dev/null 2>&1; then
    rclone copy "${BACKUP_DIR}" "${BACKUP_REMOTE}" --include "/daily/**" --include "/weekly/**" --include "/monthly/**" --max-age 2d \
      && log "☁️  Copied to ${BACKUP_REMOTE}" || fail "off-server copy to ${BACKUP_REMOTE} failed"
  else
    fail "BACKUP_REMOTE is set but rclone is not installed (apt-get install rclone)"
  fi
else
  log "⚠️  BACKUP_REMOTE not set — backups are only on this server"
fi

date +'%Y-%m-%d %H:%M:%S' > "${BACKUP_DIR}/LAST_BACKUP_OK"
log "🏁 Backup complete."
