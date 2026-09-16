#!/usr/bin/env bash
# Создать согласованный логический dump PostgreSQL и архив local storage.
set -euo pipefail
umask 077

BACKUP_DIR="${AEGIS_BACKUP_DIR:-/var/backups/aegis}"
KEEP_COUNT="${AEGIS_BACKUP_KEEP_COUNT:-1}"
STORAGE_PATH="${STORAGE_LOCAL_PATH:-/opt/aegis/backend/storage}"
MIN_FREE_BYTES="${AEGIS_BACKUP_MIN_FREE_BYTES:-1073741824}"

: "${DATABASE_URL_SYNC:?DATABASE_URL_SYNC is required}"
case "${KEEP_COUNT}" in
    ''|*[!0-9]*) echo "AEGIS_BACKUP_KEEP_COUNT must be an integer" >&2; exit 2 ;;
esac
if [ "$KEEP_COUNT" -lt 1 ]; then
    echo "AEGIS_BACKUP_KEEP_COUNT must be at least 1" >&2
    exit 2
fi
case "${MIN_FREE_BYTES}" in
    ''|*[!0-9]*) echo "AEGIS_BACKUP_MIN_FREE_BYTES must be an integer" >&2; exit 2 ;;
esac

STORAGE_BACKEND="${STORAGE_BACKEND:-local}"
case "$STORAGE_BACKEND" in
    local|s3) ;;
    *) echo "Unsupported STORAGE_BACKEND: $STORAGE_BACKEND" >&2; exit 2 ;;
esac

mkdir -p "$BACKUP_DIR"

# Незавершённые временные каталоги безопасно удалять через сутки. Завершённую
# последнюю копию до создания новой не трогаем: при любом сбое она должна
# остаться доступной для восстановления.
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d \
    -name '.incomplete-*' -mtime +1 -exec rm -rf -- {} +

# Манифест не читает содержимое многогигабайтных PDF: имена, размеры и mtime
# достаточно надёжно показывают, менялось ли локальное хранилище со времени
# последней копии.
storage_manifest=""
if [ "$STORAGE_BACKEND" = "local" ]; then
    storage_manifest=$(
        cd "$STORAGE_PATH"
        find . -type f -printf '%P\t%s\t%T@\n' | LC_ALL=C sort | sha256sum | cut -d' ' -f1
    )
fi

latest_backup=""
while IFS= read -r candidate; do
    latest_backup="$candidate"
done < <(
    find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d \
        -name '????????T??????Z' -print | LC_ALL=C sort
)

reuse_storage=false
if [ "$STORAGE_BACKEND" = "local" ] \
    && [ -n "$latest_backup" ] \
    && [ -f "$latest_backup/STORAGE_MANIFEST_SHA256" ] \
    && [ -f "$latest_backup/storage.tar.gz" ] \
    && [ "$(tr -d '[:space:]' < "$latest_backup/STORAGE_MANIFEST_SHA256")" = "$storage_manifest" ]; then
    reuse_storage=true
fi

# Для изменившегося storage резервируем место как минимум под его полный
# несжатый размер: PDF/EPUB уже сжаты и gzip почти не уменьшает их. Плюс
# оставляем системный запас, чтобы не положить PostgreSQL и journald.
available_bytes=$(df --output=avail -B1 "$BACKUP_DIR" | tail -1 | tr -d '[:space:]')
required_bytes=$MIN_FREE_BYTES
if [ "$STORAGE_BACKEND" = "local" ] && [ "$reuse_storage" = false ]; then
    storage_bytes=$(du -sb --apparent-size "$STORAGE_PATH" | cut -f1)
    required_bytes=$((required_bytes + storage_bytes))
fi
if [ "$available_bytes" -lt "$required_bytes" ]; then
    echo "Not enough free space for backup: available=$available_bytes required=$required_bytes" >&2
    exit 1
fi

stamp=$(date -u +%Y%m%dT%H%M%SZ)
work=$(mktemp -d "$BACKUP_DIR/.incomplete-${stamp}-XXXXXX")
trap 'rm -rf -- "$work"' EXIT

# pg_dump не понимает SQLAlchemy driver suffix (+psycopg2).
database_url="${DATABASE_URL_SYNC/postgresql+psycopg2:/postgresql:}"
pg_dump --format=custom --file="$work/database.dump" --dbname="$database_url"
if [ "$STORAGE_BACKEND" = "s3" ]; then
    printf 's3\n' > "$work/STORAGE_BACKEND"
    storage_result="database dump only; S3 objects use bucket versioning/backup"
elif [ "$reuse_storage" = true ]; then
    # Hard link даёт каждой дневной копии полный восстанавливаемый архив, но
    # неизменившийся storage занимает блоки на диске только один раз.
    ln "$latest_backup/storage.tar.gz" "$work/storage.tar.gz"
    storage_result="reused unchanged storage archive"
else
    tar --create --gzip --file="$work/storage.tar.gz" --directory="$STORAGE_PATH" .
    storage_result="created new storage archive"
fi
if [ "$STORAGE_BACKEND" = "local" ]; then
    printf '%s\n' "$storage_manifest" > "$work/STORAGE_MANIFEST_SHA256"
    (
        cd "$work"
        sha256sum database.dump storage.tar.gz STORAGE_MANIFEST_SHA256 > SHA256SUMS
    )
else
    (
        cd "$work"
        sha256sum database.dump STORAGE_BACKEND > SHA256SUMS
    )
fi

final="$BACKUP_DIR/$stamp"
mv "$work" "$final"
trap - EXIT

# Только теперь, когда новая копия полностью создана и SHA-256 записаны,
# удаляем более старые. По умолчанию остаётся одна последняя полная копия.
mapfile -t completed_backups < <(
    find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d \
        -name '????????T??????Z' -print | LC_ALL=C sort -r
)
for ((index=KEEP_COUNT; index<${#completed_backups[@]}; index++)); do
    rm -rf -- "${completed_backups[$index]}"
done

echo "Backup completed: $final ($storage_result)"
