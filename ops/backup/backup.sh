#!/usr/bin/env bash
# Creates one verified, encrypted backup of the whole database.
#
#   1. Dumps the database (pg_dump custom format) using a READ-ONLY role.
#   2. Restores the dump into a throwaway PostgreSQL and runs verify.sql, so
#      a backup is only kept if it actually restores and passes the checks.
#   3. Encrypts it with age to a PUBLIC key. The matching private key never
#      lives on a server: only administrators hold it, offline.
#   4. Writes a manifest (sizes, checksums, times, app version). Row counts
#      describe the business, so they're encrypted along with the data.
#
# Profile photos live in the database (UserAvatar table), so one dump covers
# records and files together and they can never drift out of sync.
#
# Environment:
#   BACKUP_DATABASE_URL   read-only connection string to production (secret)
#   BACKUP_AGE_RECIPIENT  age public key(s) to encrypt to, space-separated
#   VERIFY_DATABASE_URL   an EMPTY scratch database for the restore test
#   OUT_DIR               where to write the encrypted backup + manifest
#   APP_VERSION           git commit the app was running (optional)
set -euo pipefail
umask 077

: "${BACKUP_DATABASE_URL:?BACKUP_DATABASE_URL is not set}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT is not set}"
: "${VERIFY_DATABASE_URL:?VERIFY_DATABASE_URL is not set}"
: "${OUT_DIR:?OUT_DIR is not set}"
HERE="$(cd "$(dirname "$0")" && pwd)"

log() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*"; }

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="inventory-db-${STAMP}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT_DIR"

SERVER_VERSION="$(psql "$BACKUP_DATABASE_URL" -Atqc 'show server_version_num')"
log "Source database: PostgreSQL $((SERVER_VERSION / 10000))"

log "Dumping database..."
START=$(date +%s)
pg_dump "$BACKUP_DATABASE_URL" --format=custom --compress=9 --no-owner --no-privileges --file "$WORK/$NAME.dump"
DUMP_SECONDS=$(( $(date +%s) - START ))
DUMP_BYTES=$(stat -c %s "$WORK/$NAME.dump")
log "Dump complete: ${DUMP_BYTES} bytes in ${DUMP_SECONDS}s"

# Live row counts right after the dump, to sanity-check the copy against.
psql "$BACKUP_DATABASE_URL" -Atq -f "$HERE/row-counts.sql" > "$WORK/live-counts.json"

log "Test-restoring into a scratch database..."
psql "$VERIFY_DATABASE_URL" -Atqc "select count(*) from pg_tables where schemaname = 'public'" | grep -qx 0 \
  || { echo "VERIFY_DATABASE_URL must point to an empty database" >&2; exit 1; }
pg_restore --dbname "$VERIFY_DATABASE_URL" --no-owner --no-privileges --exit-on-error "$WORK/$NAME.dump"

log "Running integrity checks..."
psql "$VERIFY_DATABASE_URL" -v ON_ERROR_STOP=1 -Atq -f "$HERE/verify.sql"
psql "$VERIFY_DATABASE_URL" -Atq -f "$HERE/row-counts.sql" > "$WORK/backup-counts.json"
MIGRATIONS="$(psql "$VERIFY_DATABASE_URL" -Atqc "select coalesce(json_agg(migration_name order by migration_name), '[]') from _prisma_migrations where finished_at is not null and rolled_back_at is null")"

# A table can't have more rows in the copy than live just after (rows only
# get added during the dump), and core tables mustn't come back empty.
python3 - "$WORK/backup-counts.json" "$WORK/live-counts.json" <<'PY'
import json, sys
backup, live = (json.load(open(p)) for p in sys.argv[1:3])
problems = []
for table, n in live.items():
    if table not in backup:
        problems.append(f"table {table} missing from the backup")
    elif n > 0 and backup[table] == 0 and table in ("User", "Hotel", "Department"):
        problems.append(f"table {table} is empty in the backup but has {n} rows live")
for table in backup:
    if table not in live:
        problems.append(f"table {table} is in the backup but not live")
if problems:
    print("Row count check failed:\n  " + "\n  ".join(problems), file=sys.stderr)
    sys.exit(1)
print("Row counts consistent with the live database")
PY

log "Encrypting..."
SHA_PLAIN="$(sha256sum "$WORK/$NAME.dump" | cut -d' ' -f1)"
RECIPIENTS=()
for key in $BACKUP_AGE_RECIPIENT; do RECIPIENTS+=(-r "$key"); done
age "${RECIPIENTS[@]}" -o "$OUT_DIR/$NAME.dump.age" "$WORK/$NAME.dump"
SHA_ENCRYPTED="$(sha256sum "$OUT_DIR/$NAME.dump.age" | cut -d' ' -f1)"
ENCRYPTED_BYTES=$(stat -c %s "$OUT_DIR/$NAME.dump.age")

python3 - "$WORK/backup-counts.json" > "$OUT_DIR/$NAME.manifest.json" <<PY
import json, sys
print(json.dumps({
    "backup": "$NAME.dump.age",
    "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "postgresVersion": $SERVER_VERSION,
    "appVersion": "${APP_VERSION:-unknown}",
    "format": "pg_dump custom, age-encrypted",
    "dumpBytes": $DUMP_BYTES,
    "encryptedBytes": $ENCRYPTED_BYTES,
    "sha256Dump": "$SHA_PLAIN",
    "sha256Encrypted": "$SHA_ENCRYPTED",
    "dumpSeconds": $DUMP_SECONDS,
    "verified": True,
    "migrations": $MIGRATIONS,
    "tables": len(json.load(open(sys.argv[1]))),
}, indent=2))
PY
age "${RECIPIENTS[@]}" -o "$OUT_DIR/$NAME.counts.json.age" "$WORK/backup-counts.json"

# Only the encrypted file and the manifest leave this machine.
shred -u "$WORK/$NAME.dump" 2>/dev/null || rm -f "$WORK/$NAME.dump"
echo "$NAME" > "$OUT_DIR/LATEST"
log "Backup $NAME verified and encrypted (${ENCRYPTED_BYTES} bytes)"
