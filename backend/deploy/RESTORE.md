# Восстановление из резервной копии

Восстановление заменяет содержимое базы и storage. Выполняйте его только в
окно обслуживания, после проверки выбранного архива.

## 1. Проверка архива

```bash
BACKUP=/var/backups/aegis/20260904T023000Z
cd "$BACKUP"
sha256sum --check SHA256SUMS
pg_restore --list database.dump >/dev/null
tar -tzf storage.tar.gz >/dev/null
```

Для копии, созданной при `STORAGE_BACKEND=s3`, файла `storage.tar.gz` нет:
вместо него присутствует `STORAGE_BACKEND` со значением `s3`. В этом случае
проверьте `SHA256SUMS` и `database.dump`, а восстановление объектов выполняйте
из версий/резервной копии самого S3-провайдера.

## 2. Остановка приложения и дополнительная страховочная копия

```bash
systemctl stop aegis aegis-worker
sudo -u postgres pg_dump --format=custom neon_stack \
  --file=/var/backups/aegis/pre-restore-neon-stack.dump
cp -a /opt/aegis/backend/storage \
  /var/backups/aegis/pre-restore-storage
```

При S3 вместо копирования локального каталога зафиксируйте bucket, prefix и
идентификатор версии/точки восстановления у провайдера.

## 3. Восстановление

Команды ниже необратимо заменяют текущую базу и файлы. Переменная
`DATABASE_URL_SYNC` должна содержать production URL без вывода в терминал.

```bash
cd /opt/aegis/backend
DATABASE_URL_PG=$(.venv/bin/python -c \
  'from app.core.config import settings; print(settings.DATABASE_URL_SYNC.replace("postgresql+psycopg2:", "postgresql:"))')

pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname="$DATABASE_URL_PG" "$BACKUP/database.dump"

RESTORE_TMP=$(mktemp -d /opt/aegis/backend/.restore-storage-XXXXXX)
tar -xzf "$BACKUP/storage.tar.gz" -C "$RESTORE_TMP"
chown -R www-data:www-data "$RESTORE_TMP"
mv storage "storage.before-restore-$(date -u +%Y%m%dT%H%M%SZ)"
mv "$RESTORE_TMP" storage

.venv/bin/alembic upgrade head
systemctl start aegis aegis-worker
bash deploy/healthcheck.sh
```

Блок с `tar` и заменой локального `storage` выполняется только для local
backup. При S3 восстановите требуемые версии объектов средствами провайдера,
сохранив исходные ключи, затем запустите приложение и выполните аудит
хранилища из админ-панели.

Не удаляйте `storage.before-restore-*` и страховочный dump, пока не проверены
авторизация, каталог, открытие книги и поиск.
