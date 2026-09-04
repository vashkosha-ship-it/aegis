# Развёртывание Aegis

Файлы в этой папке — эталонные конфигурации боевого сервера. Держим их в
репозитории, чтобы при переезде или пересоздании машины не пришлось
восстанавливать настройки по памяти.

## Состав

| Файл | Куда ставится | Зачем |
|---|---|---|
| `nginx-aegis.conf` | `/etc/nginx/sites-available/aegis` | сайт, отдача книг, проксирование API |
| `aegis-security-headers.conf` | `/etc/nginx/snippets/` | CSP и заголовки безопасности |
| `aegis.service` | `/etc/systemd/system/` | веб-приложение (gunicorn) |
| `aegis-worker.service` | `/etc/systemd/system/` | фоновые задачи (индексация PDF) |
| `20-aegis-retention.conf` | `/etc/systemd/journald.conf.d/` | лимит размера и срока хранения системного журнала |
| `aegis-backup.service`, `aegis-backup.timer` | `/etc/systemd/system/` | ежедневная резервная копия |
| `backup.sh`, `RESTORE.md` | остаются в `/opt/aegis/backend/deploy/` | создание копии и инструкция восстановления |
| `aegis-alert@.service` | `/etc/systemd/system/` | email при падении backend, worker или backup |

## Зависимости

- PostgreSQL — основная база
- **Redis** — rate limiting и очередь фоновых задач. Без него лимиты считаются
  в памяти каждого воркера отдельно (то есть фактический лимит умножается на
  их число), а индексация книг не запускается вовсе
- Python 3.12, venv в `/opt/aegis/backend/.venv`

## Порядок установки

```bash
# 1. Код
git clone https://github.com/vashkosha-ship-it/aegis.git /opt/aegis
cd /opt/aegis/backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# 2. Переменные окружения
cp .env.example .env   # заполнить DATABASE_URL, SECRET_KEY, REDIS_URL, SMTP, CORS_ORIGINS

# 3. База
.venv/bin/alembic upgrade head

# 4. Redis
apt install -y redis-server
systemctl enable --now redis-server

# 5. Сервисы
cp deploy/aegis.service deploy/aegis-worker.service deploy/aegis-alert@.service \
  /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now aegis aegis-worker

# 6. Ограничение systemd journal
install -d -m 0755 /etc/systemd/journald.conf.d
cp deploy/20-aegis-retention.conf /etc/systemd/journald.conf.d/
systemctl restart systemd-journald

# 7. Ежедневные резервные копии
install -d -m 0700 /var/backups/aegis
cp deploy/aegis-backup.service deploy/aegis-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now aegis-backup.timer

# 8. Фронт: симлинк, чтобы git pull сразу обновлял сайт
ln -s /opt/aegis/frontend /var/www/aegis

# 9. Nginx
cp deploy/nginx-aegis.conf /etc/nginx/sites-available/aegis
cp deploy/aegis-security-headers.conf /etc/nginx/snippets/
ln -sf /etc/nginx/sites-available/aegis /etc/nginx/sites-enabled/aegis
nginx -t && systemctl reload nginx

# 10. HTTPS
certbot --nginx -d aegis-sec-library.ru -d www.aegis-sec-library.ru
```

## Хранение журналов

Ограничения journald действуют на весь системный журнал сервера, не только
на Aegis. При первом применении можно однократно удалить старые архивные
записи командой `journalctl --vacuum-size=500M`. Это необратимо, поэтому
сначала сохраните нужные записи инцидентов.

Журнал административных действий приложения хранится 365 дней. Ежедневная
задача `cleanup_expired_sessions` удаляет более старые записи вместе с
истёкшими exam/quiz/refresh-сессиями.

## Уведомления о сбоях

`aegis`, `aegis-worker` и `aegis-backup` вызывают
`aegis-alert@.service` при переходе в failed. Письмо отправляется на
`ADMIN_NOTIFY_EMAIL` через настроенный SMTP. Повтор одного и того же сервиса
подавляется на 15 минут. Безопасная проверка без остановки приложения:

```bash
systemctl start aegis-alert@aegis.service.service
journalctl -u aegis-alert@aegis.service.service -n 20 --no-pager
```

## Резервные копии

Timer ежедневно создаёт PostgreSQL dump и архив local storage в
`/var/backups/aegis`, записывает SHA-256 и хранит копии 14 дней. Проверка:

```bash
systemctl list-timers aegis-backup.timer
systemctl start aegis-backup.service
journalctl -u aegis-backup.service -n 20 --no-pager
```

Процедура восстановления описана в [RESTORE.md](RESTORE.md). Минимум раз в
квартал её нужно проверять на отдельной базе: непроверенный backup нельзя
считать восстанавливаемым.

## Обычный деплой

```bash
cd /opt/aegis && git pull
cd backend && .venv/bin/alembic upgrade head
systemctl restart aegis aegis-worker
```

Фронт подхватывается сам через симлинк. При изменении `sw.js` поднимите версию
`CACHE_NAME`, иначе Service Worker продолжит отдавать старую версию.

## Проверка после деплоя

```bash
systemctl is-active aegis aegis-worker redis-server
journalctl -u aegis -n 30 --no-pager | grep -i error
curl -sI https://aegis-sec-library.ru/ | grep -i content-security-policy
bash /opt/aegis/backend/deploy/healthcheck.sh
```

`/health` и `/ready` должны возвращать JSON backend, а не HTML главной
страницы. `healthcheck.sh` проверяет не только HTTP 200, но и содержимое JSON,
включая отдельный успешный статус Redis.
