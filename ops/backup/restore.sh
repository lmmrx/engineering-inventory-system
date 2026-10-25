#!/usr/bin/env bash
# Restores an encrypted backup into an EMPTY database and verifies it.
#
#   ops/backup/restore.sh <backup.dump.age> <age-identity-file> [manifest.json]
#
# Environment:
#   TARGET_DATABASE_URL   connection string of an EMPTY database to restore into
#                         (a new Neon branch/project, or a local PostgreSQL)
#
# By design this never overwrites anything: it refuses a target that already
# has tables. Going back to production is a separate, deliberate step —
# pointing the app at the verified copy — described in
# docs/backup-and-disaster-recovery.md.
set -euo pipefail
umask 077

BACKUP="${1:?Usage: restore.sh <backup.dump.age> <age-identity-file> [manifest.json]}"
IDENTITY="${2:?Usage: restore.sh <backup.dump.age> <age-identity-file> [manifest.json]}"
MANIFEST="${3:-${BACKUP%.dump.age}.manifest.json}"
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL is not set}"
HERE="$(cd "$(dirname "$0")" && pwd)"
log() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*"; }

START=$(date +%s)

TABLES="$(psql "$TARGET_DATABASE_URL" -Atqc "select count(*) from pg_tables where schemaname = 'public'")"
if [ "$TABLES" != "0" ]; then
  echo "Refusing to restore: the target database already has $TABLES table(s)." >&2
  echo "Restore into an empty database (e.g. a new Neon branch), never over existing data." >&2
  exit 1
fi

if [ -f "$MANIFEST" ]; then
  EXPECTED="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["sha256Encrypted"])' "$MANIFEST")"
  ACTUAL="$(sha256sum "$BACKUP" | cut -d' ' -f1)"
  [ "$EXPECTED" = "$ACTUAL" ] || { echo "Checksum mismatch: the backup file was altered or damaged." >&2; exit 1; }
  log "Checksum matches the manifest"
else
  log "No manifest found — skipping the checksum check"
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
log "Decrypting..."
age --decrypt -i "$IDENTITY" -o "$WORK/restore.dump" "$BACKUP"

log "Restoring..."
pg_restore --dbname "$TARGET_DATABASE_URL" --no-owner --no-privileges --exit-on-error "$WORK/restore.dump"
shred -u "$WORK/restore.dump" 2>/dev/null || rm -f "$WORK/restore.dump"

log "Running integrity checks..."
psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -Atq -f "$HERE/verify.sql"

COUNTS="${BACKUP%.dump.age}.counts.json.age"
if [ -f "$COUNTS" ]; then
  age --decrypt -i "$IDENTITY" -o "$WORK/expected-counts.json" "$COUNTS"
  psql "$TARGET_DATABASE_URL" -Atq -f "$HERE/row-counts.sql" > "$WORK/restored-counts.json"
  python3 - "$WORK/expected-counts.json" "$WORK/restored-counts.json" <<'PY'
import json, sys
expected = json.load(open(sys.argv[1]))
actual = json.load(open(sys.argv[2]))
diff = {t: (expected.get(t), actual.get(t)) for t in set(expected) | set(actual) if expected.get(t) != actual.get(t)}
if diff:
    print("Row counts differ from the backup's record:", diff, file=sys.stderr)
    sys.exit(1)
print(f"Row counts match the backup's record ({sum(actual.values())} rows across {len(actual)} tables)")
PY
fi

log "Restore verified in $(( $(date +%s) - START ))s"
