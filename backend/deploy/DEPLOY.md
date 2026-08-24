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
cp deploy/aegis.service deploy/aegis-worker.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now aegis aegis-worker

# 6. Фронт: симлинк, чтобы git pull сразу обновлял сайт
ln -s /opt/aegis/frontend /var/www/aegis

# 7. Nginx
cp deploy/nginx-aegis.conf /etc/nginx/sites-available/aegis
cp deploy/aegis-security-headers.conf /etc/nginx/snippets/
ln -sf /etc/nginx/sites-available/aegis /etc/nginx/sites-enabled/aegis
nginx -t && systemctl reload nginx

# 8. HTTPS
certbot --nginx -d aegis-sec-library.ru -d www.aegis-sec-library.ru
```

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
```
