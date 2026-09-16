# Переход Aegis с локального диска на S3

Процедура сохраняет логические ключи PDF, EPUB, обложек и аватаров, поэтому
изменять базу данных не требуется. Bucket остаётся приватным: браузер получает
файлы только через API Aegis после действующих проверок доступа.

## 1. Подготовить bucket

- включить versioning;
- запретить публичный доступ;
- включить серверное шифрование политикой bucket либо через
  `S3_SERVER_SIDE_ENCRYPTION=AES256`;
- настроить отдельное резервное копирование или репликацию версий;
- выдать ключу приложения только `ListBucket`, `GetObject`, `PutObject` и
  `DeleteObject` для выбранного bucket и `S3_KEY_PREFIX`.

Версионирование не заменяет резервную копию: удаление bucket или учётной записи
может удалить и версии. Резервная копия должна находиться в другом контуре.

## 2. Настроить доступ, не переключая production

В `/opt/aegis/backend/.env` сначала оставьте:

```dotenv
STORAGE_BACKEND=local
STORAGE_LOCAL_PATH=/opt/aegis/backend/storage

S3_ENDPOINT_URL=https://s3.example.invalid
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET_BOOKS=aegis-books
S3_REGION=us-east-1
S3_KEY_PREFIX=production
S3_FORCE_PATH_STYLE=False
S3_VERIFY_TLS=True
S3_SERVER_SIDE_ENCRYPTION=
```

Для MinIO и некоторых S3-совместимых сервисов требуется
`S3_FORCE_PATH_STYLE=True`. Не отключайте TLS-проверку в production.

## 3. Предварительная сверка и копирование

Команды выполняются от пользователя приложения, чтобы проверить те же права и
окружение, с которыми работают backend и worker:

```bash
cd /opt/aegis/backend

sudo -u www-data .venv/bin/python -m scripts.migrate_storage_to_s3
sudo -u www-data .venv/bin/python -m scripts.migrate_storage_to_s3 --execute
```

Первый запуск ничего не меняет. Второй можно безопасно повторять: совпадающие
по ключу и размеру объекты пропускаются. Конфликт другого размера требует
ручной проверки; `--overwrite` используйте только для ожидаемой замены.

## 4. Финальная синхронизация и переключение

На короткое окно обслуживания остановите запись новых файлов, повторите
синхронизацию и только после успешной итоговой сверки измените backend:

```bash
sudo systemctl stop aegis aegis-worker

cd /opt/aegis/backend
sudo -u www-data .venv/bin/python -m scripts.migrate_storage_to_s3 --execute

# После успешной строки «объектов сверены»:
sudoedit /opt/aegis/backend/.env
# STORAGE_BACKEND=s3

sudo systemctl start aegis aegis-worker
curl -fsS https://www.aegis-sec-library.ru/ready | python3 -m json.tool
bash deploy/healthcheck.sh
```

Проверьте в интерфейсе PDF с Range-запросами, EPUB, несколько обложек,
загрузку новой обложки и повторную индексацию книги. `/ready` выполняет
реальную запись, чтение и удаление небольшого S3-объекта.

## 5. Откат

До удаления локальных файлов откат мгновенный:

```bash
sudo systemctl stop aegis aegis-worker
sudoedit /opt/aegis/backend/.env
# STORAGE_BACKEND=local
sudo systemctl start aegis aegis-worker
```

Не удаляйте `/opt/aegis/backend/storage` до проверки production и отдельной
внешней копии bucket. После подтверждённой работы S3 локальный каталог можно
перенести на временный архивный том, а затем удалить отдельным осознанным
действием.

## Резервные копии после переключения

`aegis-backup.timer` продолжает ежедневно сохранять PostgreSQL dump и SHA-256,
но не скачивает весь bucket обратно на системный диск. Файлы защищаются
versioning/backup политикой S3-провайдера. Восстановление описано в
`RESTORE.md`.
