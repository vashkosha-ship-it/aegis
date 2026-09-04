#!/usr/bin/env bash
# Создать согласованный логический dump PostgreSQL и архив local storage.
set -euo pipefail
umask 077

BACKUP_DIR="${AEGIS_BACKUP_DIR:-/var/backups/aegis}"
KEEP_DAYS="${AEGIS_BACKUP_KEEP_DAYS:-14}"
STORAGE_PATH="${STORAGE_LOCAL_PATH:-/opt/aegis/backend/storage}"

: "${DATABASE_URL_SYNC:?DATABASE_URL_SYNC is required}"
case "${KEEP_DAYS}" in
    ''|*[!0-9]*) echo "AEGIS_BACKUP_KEEP_DAYS must be an integer" >&2; exit 2 ;;
esac

if [ "${STORAGE_BACKEND:-local}" != "local" ]; then
    echo "S3 storage requires provider-side versioning/backup; refusing partial backup" >&2
    exit 2
fi

mkdir -p "$BACKUP_DIR"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
work=$(mktemp -d "$BACKUP_DIR/.incomplete-${stamp}-XXXXXX")
trap 'rm -rf -- "$work"' EXIT

# pg_dump не понимает SQLAlchemy driver suffix (+psycopg2).
database_url="${DATABASE_URL_SYNC/postgresql+psycopg2:/postgresql:}"
pg_dump --format=custom --file="$work/database.dump" --dbname="$database_url"
tar --create --gzip --file="$work/storage.tar.gz" --directory="$STORAGE_PATH" .
(
    cd "$work"
    sha256sum database.dump storage.tar.gz > SHA256SUMS
)

final="$BACKUP_DIR/$stamp"
mv "$work" "$final"
trap - EXIT

# Удаляем только каталоги с нашим UTC-форматом; незавершённые каталоги старше
# суток также безопасно подчищаются.
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d \
    -name '????????T??????Z' -mtime "+$KEEP_DAYS" -exec rm -rf -- {} +
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d \
    -name '.incomplete-*' -mtime +1 -exec rm -rf -- {} +

echo "Backup completed: $final"
