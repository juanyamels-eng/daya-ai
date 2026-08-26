#!/usr/bin/env bash
# ============================================
# DAYA IA — Postgres Restore Script
# Usage: ./restore-db.sh <backup-file.dump.gz>
# ============================================

set -euo pipefail

DB_URL="${DATABASE_URL}"
BACKUP_FILE="${1:-}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date -u +"%Y-%m-%d %H:%M:%S UTC")]${NC} $1"; }
warn() { echo -e "${YELLOW}[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] WARNING:${NC} $1"; }
error() { echo -e "${RED}[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] ERROR:${NC} $1"; }

if [[ -z "${BACKUP_FILE}" ]]; then
  error "Usage: $0 <backup-file.dump.gz>"
  echo "Available backups:"
  ls -lh /var/backups/daya-ia/daya_ia_*.dump.gz 2>/dev/null | tail -10
  exit 1
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
  error "Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

if [[ -z "${DB_URL}" ]]; then
  error "DATABASE_URL environment variable not set"
  exit 1
fi

# Confirmation
warn "This will OVERWRITE the database at ${DB_URL}"
warn "Backup file: ${BACKUP_FILE}"
read -p "Are you sure you want to continue? Type 'YES' to confirm: " CONFIRM
if [[ "${CONFIRM}" != "YES" ]]; then
  log "Restore cancelled"
  exit 0
fi

log "Starting restore from ${BACKUP_FILE}"

# Decompress if needed
if [[ "${BACKUP_FILE}" == *.gz ]]; then
  log "Decompressing backup..."
  gunzip -c "${BACKUP_FILE}" > "${BACKUP_FILE%.gz}"
  RESTORE_FILE="${BACKUP_FILE%.gz}"
else
  RESTORE_FILE="${BACKUP_FILE}"
fi

# Restore using pg_restore
log "Restoring database..."
if pg_restore --clean --if-exists --no-owner --no-privileges --dbname="${DB_URL}" "${RESTORE_FILE}"; then
  log "Restore completed successfully"
  
  # Clean up decompressed file if we created one
  if [[ "${BACKUP_FILE}" == *.gz && -f "${RESTORE_FILE}" ]]; then
    rm "${RESTORE_FILE}"
  fi
else
  error "Restore failed"
  exit 1
fi

log "Database restored successfully from ${BACKUP_FILE}"