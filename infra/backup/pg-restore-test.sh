#!/usr/bin/env bash
# CIVORA — pg-restore-test.sh
# Downloads the latest R2 backup, decrypts, restores to isolated test DB,
# validates data integrity, then drops the test DB.
# A dump not tested = not a backup.
# Required env: DATABASE_URL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, BACKUP_GPG_KEY
# Optional env: RESTORE_TEST_DB (default civora_restore_test)

set -euo pipefail

REPORT_FILE="${REPORT_FILE:-/tmp/civora-restore-report.txt}"
TEST_DB="${RESTORE_TEST_DB:-civora_restore_test}"
TIMESTAMP=$(date -u '+%Y%m%dT%H%M%SZ')
DL_FILE="/tmp/civora-restore-latest.dump.gpg"
DUMP_FILE="/tmp/civora-restore-latest.dump"

log()    { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*" | tee -a "${REPORT_FILE}"; }
die()    { log "ERROR: $*"; echo "RESTORE_STATUS=FAILURE" >> "${REPORT_FILE}"; cleanup; exit 1; }
cleanup() {
  rm -f "${DL_FILE}" "${DUMP_FILE}"
  # Drop test DB (best-effort)
  if command -v psql &>/dev/null; then
    PGPASSWORD="${DB_PASS}" psql \
      --host="${DB_HOST}" --port="${DB_PORT}" \
      --username="${DB_USER}" --dbname=postgres \
      -c "DROP DATABASE IF EXISTS ${TEST_DB};" 2>/dev/null || true
    log "Test database '${TEST_DB}' dropped"
  fi
}
trap cleanup EXIT

# ─── Validate env ────────────────────────────────────────────────────────────
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID is required}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is required}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is required}"
: "${R2_BUCKET:?R2_BUCKET is required}"
: "${BACKUP_GPG_KEY:?BACKUP_GPG_KEY is required}"

# Parse DATABASE_URL
DB_HOST=$(echo "${DATABASE_URL}" | sed -n 's|.*@\([^:/]*\)[:/].*|\1|p')
DB_PORT=$(echo "${DATABASE_URL}" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
DB_PORT="${DB_PORT:-5432}"
DB_USER=$(echo "${DATABASE_URL}" | sed -n 's|.*://\([^:]*\):.*|\1|p')
DB_PASS=$(echo "${DATABASE_URL}" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')

R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
export AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}"
export AWS_DEFAULT_REGION="auto"

log "=== CIVORA PostgreSQL Restore Test ==="
log "Test DB: ${TEST_DB} @ ${DB_HOST}:${DB_PORT}"
log "Timestamp: ${TIMESTAMP}"

# ─── Find latest daily backup ────────────────────────────────────────────────
log "Looking for latest daily backup in s3://${R2_BUCKET}/daily/ ..."
LATEST_KEY=$(aws s3 ls "s3://${R2_BUCKET}/daily/" \
  --endpoint-url "${R2_ENDPOINT}" \
  | sort -k1,2 | tail -1 | awk '{print $4}')

[ -z "${LATEST_KEY}" ] && die "No backup files found in s3://${R2_BUCKET}/daily/"
log "Latest backup: daily/${LATEST_KEY}"

# ─── Download ────────────────────────────────────────────────────────────────
log "Downloading..."
aws s3 cp "s3://${R2_BUCKET}/daily/${LATEST_KEY}" "${DL_FILE}" \
  --endpoint-url "${R2_ENDPOINT}" \
  --no-progress || die "Download failed"
DL_SIZE=$(du -sh "${DL_FILE}" | cut -f1)
log "Downloaded: ${DL_SIZE}"

# ─── Decrypt ─────────────────────────────────────────────────────────────────
log "Decrypting..."
echo "${BACKUP_GPG_KEY}" | gpg --batch --yes --passphrase-fd 0 \
  --decrypt --output "${DUMP_FILE}" "${DL_FILE}" || die "GPG decryption failed"
rm -f "${DL_FILE}"
DUMP_SIZE=$(du -sh "${DUMP_FILE}" | cut -f1)
log "Decrypted dump size: ${DUMP_SIZE}"

# ─── Create isolated test DB ─────────────────────────────────────────────────
log "Creating test database '${TEST_DB}'..."
PGPASSWORD="${DB_PASS}" psql \
  --host="${DB_HOST}" --port="${DB_PORT}" \
  --username="${DB_USER}" --dbname=postgres \
  -c "DROP DATABASE IF EXISTS ${TEST_DB};" 2>/dev/null || true

PGPASSWORD="${DB_PASS}" psql \
  --host="${DB_HOST}" --port="${DB_PORT}" \
  --username="${DB_USER}" --dbname=postgres \
  -c "CREATE DATABASE ${TEST_DB};" || die "Could not create test database"
log "Test database created"

# ─── Restore ─────────────────────────────────────────────────────────────────
log "Restoring dump into '${TEST_DB}'..."
PGPASSWORD="${DB_PASS}" pg_restore \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USER}" \
  --dbname="${TEST_DB}" \
  --no-owner \
  --no-acl \
  --exit-on-error \
  "${DUMP_FILE}" || die "pg_restore failed"
rm -f "${DUMP_FILE}"
log "Restore complete"

# ─── Validate data integrity ─────────────────────────────────────────────────
log "Validating data integrity..."

psql_q() {
  PGPASSWORD="${DB_PASS}" psql \
    --host="${DB_HOST}" --port="${DB_PORT}" \
    --username="${DB_USER}" --dbname="${TEST_DB}" \
    --tuples-only --no-align -c "$1"
}

VALIDATION_ERRORS=0

check_table() {
  local table="$1"
  local min_rows="${2:-0}"
  local count
  count=$(psql_q "SELECT count(*) FROM ${table};" 2>/dev/null | tr -d ' ' || echo "ERROR")
  if [ "${count}" = "ERROR" ]; then
    log "  FAIL — table '${table}' does not exist or query failed"
    VALIDATION_ERRORS=$((VALIDATION_ERRORS + 1))
  elif [ "${count}" -lt "${min_rows}" ]; then
    log "  WARN — table '${table}' has ${count} rows (expected >=${min_rows})"
  else
    log "  OK   — table '${table}': ${count} rows"
  fi
}

check_table "agences"          0
check_table "utilisateurs"     0
check_table "roles"            0
check_table "domain_events"    0
check_table "audit_log"        0
check_table "notifications"    0
check_table "workflows"        0

# Check that pgvector extension is present (required for ai_embeddings)
EXT_CHECK=$(psql_q "SELECT extname FROM pg_extension WHERE extname='vector';" 2>/dev/null || echo "")
if [ -z "${EXT_CHECK}" ]; then
  log "  WARN — pgvector extension not found in restored DB (may need manual install)"
else
  log "  OK   — pgvector extension present"
fi

# Check RLS is enabled on at least one business table
RLS_COUNT=$(psql_q "SELECT count(*) FROM pg_class WHERE relrowsecurity = true AND relname IN ('agences','utilisateurs','domain_events');" 2>/dev/null | tr -d ' ' || echo "0")
if [ "${RLS_COUNT}" -eq "0" ]; then
  log "  WARN — RLS not enabled on expected tables (schema may differ)"
else
  log "  OK   — RLS enabled on ${RLS_COUNT} key tables"
fi

[ "${VALIDATION_ERRORS}" -gt "0" ] && die "${VALIDATION_ERRORS} validation check(s) failed"

# ─── Done ────────────────────────────────────────────────────────────────────
log "=== Restore test PASSED ==="
echo "RESTORE_STATUS=SUCCESS" >> "${REPORT_FILE}"
echo "RESTORE_SOURCE=${LATEST_KEY}" >> "${REPORT_FILE}"
echo "RESTORE_SIZE=${DUMP_SIZE}" >> "${REPORT_FILE}"
echo "RESTORE_TIMESTAMP=${TIMESTAMP}" >> "${REPORT_FILE}"
