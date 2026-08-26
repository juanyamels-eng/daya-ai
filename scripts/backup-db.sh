#!/usr/bin/env bash
# ============================================
# DAYA IA — Postgres Backup Script
# Run via cron: 0 3 * * * /path/to/scripts/backup-db.sh
# ============================================

set -euo pipefail

# Configuration
DB_URL="${DATABASE_URL}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/daya-ia}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
S3_BUCKET="${S3_BACKUP_BUCKET:-}"  # Optional: upload to S3
S3_PREFIX="${S3_BACKUP_PREFIX:-daya-ia}"
NOTIFY_WEBHOOK="${BACKUP_NOTIFY_WEBHOOK:-}"  # Optional: Slack/Discord webhook

# Timestamp
TIMESTAMP=$(date -u +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/daya_ia_${TIMESTAMP}.dump"
BACKUP_FILE_COMPRESSED="${BACKUP_FILE}.gz"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
  echo -e "${GREEN}[$(date -u +"%Y-%m-%d %H:%M:%S UTC")]${NC} $1"
}

warn() {
  echo -e "${YELLOW}[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] WARNING:${NC} $1"
}

error() {
  echo -e "${RED}[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] ERROR:${NC} $1"
}

notify() {
  local status=$1
  local message=$2
  if [[ -n "${NOTIFY_WEBHOOK}" ]]; then
    curl -s -X POST "${NOTIFY_WEBHOOK}" \
      -H "Content-Type: application/json" \
      -d "{\"text\": \"[DAYA Backup] ${status}: ${message}\"}" > /dev/null || true
  fi
}

# Check dependencies
for cmd in pg_dump gzip; do
  if ! command -v "$cmd" &> /dev/null; then
    error "$cmd not found. Please install postgresql-client and gzip."
    exit 1
  fi
done

# Create backup directory
mkdir -p "${BACKUP_DIR}"

# Validate DATABASE_URL
if [[ -z "${DB_URL}" ]]; then
  error "DATABASE_URL environment variable not set"
  exit 1
fi

log "Starting backup of DAYA IA database"
log "Backup file: ${BACKUP_FILE_COMPRESSED}"

# Perform backup using pg_dump (custom format for flexibility)
if pg_dump "${DB_URL}" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --compress=9 \
  --file="${BACKUP_FILE}"; then

  log "pg_dump completed successfully"

  # Compress with gzip (additional compression on top of pg_dump's)
  if gzip -f "${BACKUP_FILE}"; then
    log "Compression completed: ${BACKUP_FILE_COMPRESSED}"
  else
    error "Compression failed"
    exit 1
  fi

  # Get file size
  FILE_SIZE=$(du -h "${BACKUP_FILE_COMPRESSED}" | cut -f1)
  log "Backup size: ${FILE_SIZE}"

  # Optional: Upload to S3
  if [[ -n "${S3_BUCKET}" ]]; then
    if command -v aws &> /dev/null; then
      log "Uploading to S3: s3://${S3_BUCKET}/${S3_PREFIX}/"
      if aws s3 cp "${BACKUP_FILE_COMPRESSED}" "s3://${S3_BUCKET}/${S3_PREFIX}/$(basename ${BACKUP_FILE_COMPRESSED})" --storage-class STANDARD_IA; then
        log "S3 upload completed"
      else
        warn "S3 upload failed (backup still available locally)"
      fi
    else
      warn "AWS CLI not installed, skipping S3 upload"
    fi
  fi

  # Cleanup old local backups
  log "Cleaning up backups older than ${RETENTION_DAYS} days"
  find "${BACKUP_DIR}" -name "daya_ia_*.dump.gz" -mtime +"${RETENTION_DAYS}" -delete

  # Optional: Cleanup old S3 backups (requires lifecycle policy or manual)
  if [[ -n "${S3_BUCKET}" ]] && command -v aws &> /dev/null; then
    # This is a simple approach; consider S3 Lifecycle policies for production
    aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}/" | while read -r line; do
      FILE_DATE=$(echo "$line" | awk '{print $1}')
      FILE_NAME=$(echo "$line" | awk '{print $4}')
      if [[ -n "$FILE_DATE" && -n "$FILE_NAME" ]]; then
        FILE_EPOCH=$(date -d "$FILE_DATE" +%s 2>/dev/null || date -j -f "%Y-%m-%d" "$FILE_DATE" +%s 2>/dev/null)
        RETENTION_EPOCH=$(date -d "-${RETENTION_DAYS} days" +%s 2>/dev/null || date -j -v"-${RETENTION_DAYS}d" +%s 2>/dev/null)
        if [[ -n "$FILE_EPOCH" && -n "$RETENTION_EPOCH" && "$FILE_EPOCH" -lt "$RETENTION_EPOCH" ]]; then
          aws s3 rm "s3://${S3_BUCKET}/${S3_PREFIX}/${FILE_NAME}" && log "Deleted old S3 backup: ${FILE_NAME}"
        fi
      fi
    done
  fi

  log "Backup completed successfully"
  notify "SUCCESS" "Backup completed: ${BACKUP_FILE_COMPRESSED} (${FILE_SIZE})"

else
  error "pg_dump failed"
  notify "FAILED" "pg_dump failed for DAYA IA database"
  exit 1
fi