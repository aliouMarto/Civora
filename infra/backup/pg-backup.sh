#!/usr/bin/env bash
# CIVORA — pg-backup.sh
# Dump PostgreSQL → GPG-encrypt → push to Cloudflare R2
# Required env: DATABASE_URL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, BACKUP_GPG_KEY
# Optional env: BACKUP_RETENTION_DAYS (default 30), BACKUP_RETENTION_MONTHLY (default 12)

set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────────────
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
RETENTION_MONTHLY="${BACKUP_RETENTION_MONTHLY:-12}"
REPORT_FILE="${REPORT_FILE:-/tmp/civora-backup-report.txt}"
TIMESTAMP=$(date -u '+%Y%m%dT%H%M%SZ')
DAY_OF_MONTH=$(date -u '+%d')
BACKUP_BASE="civora-pg-${TIMESTAMP}"
DUMP_FILE="/tmp/${BACKUP_BASE}.dump"
ENC_FILE="/tmp/${BACKUP_BASE}.dump.gpg"

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*" | tee -a "${REPORT_FILE}"; }
die() { log "ERROR: $*"; echo "BACKUP_STATUS=FAILURE" >> "${REPORT_FILE}"; exit 1; }

# ─── Validate env ────────────────────────────────────────────────────────────
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID is required}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is required}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is required}"
: "${R2_BUCKET:?R2_BUCKET is required}"
: "${BACKUP_GPG_KEY:?BACKUP_GPG_KEY is required}"

# Parse DATABASE_URL: postgresql://user:pass@host:port/dbname
DB_HOST=$(echo "${DATABASE_URL}" | sed -n 's|.*@\([^:/]*\)[:/].*|\1|p')
DB_PORT=$(echo "${DATABASE_URL}" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
DB_PORT="${DB_PORT:-5432}"
DB_NAME=$(echo "${DATABASE_URL}" | sed -n 's|.*/\([^?]*\).*|\1|p')
DB_USER=$(echo "${DATABASE_URL}" | sed -n 's|.*://\([^:]*\):.*|\1|p')
DB_PASS=$(echo "${DATABASE_URL}" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')

log "=== CIVORA PostgreSQL Backup ==="
log "Database: ${DB_NAME} @ ${DB_HOST}:${DB_PORT}"
log "Timestamp: ${TIMESTAMP}"
log "Retention: ${RETENTION_DAYS}d daily / ${RETENTION_MONTHLY}m monthly"

# ─── Dump ────────────────────────────────────────────────────────────────────
log "Dumping database..."
PGPASSWORD="${DB_PASS}" pg_dump \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USER}" \
  --dbname="${DB_NAME}" \
  --format=custom \
  --compress=9 \
  --no-password \
  --file="${DUMP_FILE}" || die "pg_dump failed"

DUMP_SIZE=$(du -sh "${DUMP_FILE}" | cut -f1)
log "Dump complete: ${DUMP_SIZE}"

# ─── Encrypt ─────────────────────────────────────────────────────────────────
log "Encrypting dump..."
echo "${BACKUP_GPG_KEY}" | gpg --batch --yes --passphrase-fd 0 \
  --symmetric --cipher-algo AES256 \
  --output "${ENC_FILE}" \
  "${DUMP_FILE}" || die "GPG encryption failed"

rm -f "${DUMP_FILE}"  # remove plaintext immediately
log "Encryption complete"

# ─── Configure R2 (S3-compatible) ────────────────────────────────────────────
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

export AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}"
export AWS_DEFAULT_REGION="auto"

# ─── Upload daily ────────────────────────────────────────────────────────────
DAILY_KEY="daily/${BACKUP_BASE}.dump.gpg"
log "Uploading daily backup to s3://${R2_BUCKET}/${DAILY_KEY} ..."
aws s3 cp "${ENC_FILE}" "s3://${R2_BUCKET}/${DAILY_KEY}" \
  --endpoint-url "${R2_ENDPOINT}" \
  --no-progress || die "Upload failed"
log "Upload complete"

# ─── Upload monthly (1st of month) ───────────────────────────────────────────
if [ "${DAY_OF_MONTH}" = "01" ]; then
  MONTHLY_KEY="monthly/civora-pg-$(date -u '+%Y%m').dump.gpg"
  log "First of month — uploading monthly backup: ${MONTHLY_KEY}"
  aws s3 cp "${ENC_FILE}" "s3://${R2_BUCKET}/${MONTHLY_KEY}" \
    --endpoint-url "${R2_ENDPOINT}" \
    --no-progress || log "WARN: Monthly upload failed (non-fatal)"
fi

rm -f "${ENC_FILE}"

# ─── Prune old daily backups ─────────────────────────────────────────────────
log "Pruning daily backups older than ${RETENTION_DAYS} days..."
CUTOFF=$(date -u -d "${RETENTION_DAYS} days ago" '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null \
         || date -u -v-"${RETENTION_DAYS}d" '+%Y-%m-%dT%H:%M:%SZ')

aws s3 ls "s3://${R2_BUCKET}/daily/" \
  --endpoint-url "${R2_ENDPOINT}" 2>/dev/null \
  | awk '{print $4}' \
  | while read -r key; do
    file_date=$(echo "${key}" | grep -oP '\d{8}T\d{6}Z' || true)
    if [ -n "${file_date}" ] && [[ "${file_date}" < "$(date -u -d "${RETENTION_DAYS} days ago" '+%Y%m%dT%H%M%SZ' 2>/dev/null || date -u -v-"${RETENTION_DAYS}d" '+%Y%m%dT%H%M%SZ')" ]]; then
      log "  Deleting old backup: daily/${key}"
      aws s3 rm "s3://${R2_BUCKET}/daily/${key}" \
        --endpoint-url "${R2_ENDPOINT}" || log "  WARN: Could not delete ${key}"
    fi
  done

# ─── Prune old monthly backups ───────────────────────────────────────────────
log "Pruning monthly backups older than ${RETENTION_MONTHLY} months..."
MONTHLY_CUTOFF=$(date -u -d "${RETENTION_MONTHLY} months ago" '+%Y%m' 2>/dev/null \
                 || date -u -v-"${RETENTION_MONTHLY}m" '+%Y%m')

aws s3 ls "s3://${R2_BUCKET}/monthly/" \
  --endpoint-url "${R2_ENDPOINT}" 2>/dev/null \
  | awk '{print $4}' \
  | while read -r key; do
    file_month=$(echo "${key}" | grep -oP '\d{6}' | head -1 || true)
    if [ -n "${file_month}" ] && [[ "${file_month}" < "${MONTHLY_CUTOFF}" ]]; then
      log "  Deleting old monthly: monthly/${key}"
      aws s3 rm "s3://${R2_BUCKET}/monthly/${key}" \
        --endpoint-url "${R2_ENDPOINT}" || log "  WARN: Could not delete ${key}"
    fi
  done

# ─── Done ────────────────────────────────────────────────────────────────────
log "=== Backup completed successfully ==="
echo "BACKUP_STATUS=SUCCESS" >> "${REPORT_FILE}"
echo "BACKUP_KEY=${DAILY_KEY}" >> "${REPORT_FILE}"
echo "BACKUP_SIZE=${DUMP_SIZE}" >> "${REPORT_FILE}"
