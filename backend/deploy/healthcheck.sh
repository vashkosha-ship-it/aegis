#!/usr/bin/env bash
#
# Проверка боевого окружения после деплоя.
#
# Собирает воедино то, что мы иначе проверяем вручную: заголовки безопасности,
# постраничную отдачу книг, закрытость внутренних путей, живость сервисов.
# Тесты в CI до этого не дотягиваются: там нет ни nginx, ни настоящих
# сертификатов.
#
# Запуск на сервере:
#   bash /opt/aegis/backend/deploy/healthcheck.sh
#
# Код возврата: 0 — всё хорошо, 1 — есть проблемы.

set -uo pipefail

DOMAIN="${AEGIS_DOMAIN:-aegis-sec-library.ru}"
BASE="https://${DOMAIN}"
APP_DIR="${AEGIS_DIR:-/opt/aegis}"
# Опциональный access token отдельного read-only пользователя позволяет
# проверить настоящий ответ 206. Значение не печатается и не сохраняется.
HEALTH_TOKEN="${AEGIS_HEALTH_TOKEN:-}"

failed=0
checks=0

green() { printf '\033[32m%s\033[0m\n' "$1"; }
red()   { printf '\033[31m%s\033[0m\n' "$1"; }
gray()  { printf '\033[90m%s\033[0m\n' "$1"; }

ok()   { checks=$((checks+1)); green "  ✓ $1"; }
fail() { checks=$((checks+1)); failed=$((failed+1)); red "  ✗ $1"; [ -n "${2:-}" ] && gray "    $2"; }

section() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# ---------------------------------------------------------------------------
section "Сервисы"

for unit in aegis aegis-worker redis-server postgresql nginx; do
    if systemctl is-active --quiet "$unit"; then
        ok "$unit запущен"
    else
        fail "$unit не работает" "systemctl status $unit"
    fi
done

# Воркер должен знать про все задачи, включая плановую очистку.
#
# Вывод журнала сохраняем в переменную, а не отдаём в grep через конвейер:
# grep -q закрывает трубу на первом совпадении, journalctl получает SIGPIPE и
# умирает с кодом 141. При set -o pipefail код конвейера берётся от него, а не
# от grep, — и проверка падала ровно тогда, когда задача находилась.
worker_log=$(journalctl -u aegis-worker -n 50 --no-pager 2>/dev/null || true)
if grep -q "cron:cleanup_expired_sessions" <<<"$worker_log"; then
    ok "фоновые задачи зарегистрированы (включая очистку сессий)"
else
    fail "воркер не видит задачу очистки" "journalctl -u aegis-worker -n 30"
fi

# ---------------------------------------------------------------------------
section "Заголовки безопасности"

headers=$(curl -sSI "$BASE/" 2>/dev/null)

check_header() {
    if grep -qi "^$1:" <<<"$headers"; then
        ok "$1"
    else
        fail "нет заголовка $1" "проверьте include snippets/aegis-security-headers.conf"
    fi
}

check_header "Content-Security-Policy"
check_header "X-Content-Type-Options"
check_header "X-Frame-Options"
check_header "Referrer-Policy"
check_header "Strict-Transport-Security"

# Точки входа приложения не должны кэшироваться: иначе правки не доезжают
# до пользователей, пока те вручную не почистят кэш.
if curl -sSI "$BASE/app.js" 2>/dev/null | grep -qi "cache-control:.*no-cache"; then
    ok "app.js отдаётся без кэширования"
else
    fail "app.js кэшируется" "правки кода не дойдут до пользователей"
fi

# ---------------------------------------------------------------------------
section "Доступ к файлам книг"

# Внутренний путь для X-Accel-Redirect. Снаружи он обязан быть недоступен:
# иначе любой желающий скачает любую книгу, минуя проверку прав.
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/_protected_pdf/books/pdf/" 2>/dev/null)
if [ "$code" = "404" ] || [ "$code" = "403" ]; then
    ok "/_protected_pdf/ закрыт снаружи ($code)"
else
    fail "/_protected_pdf/ отвечает $code" "должен быть internal в конфиге nginx"
fi

# Постраничная загрузка PDF. Без Range-ответов книга качается целиком:
# на файле в 150 МБ это минуты ожидания вместо секунд.
# Спрашиваем ту же базу, что использует приложение. Имя БД нельзя
# хардкодить: на production оно может отличаться от примера в .env.example.
book_id=$(
    cd "$APP_DIR/backend" 2>/dev/null &&
    sudo -u www-data .venv/bin/python - <<'PY' 2>/dev/null
import asyncio

from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.book import Book


async def main():
    async with AsyncSessionLocal() as db:
        book_id = await db.scalar(
            select(Book.id)
            .where(Book.pdf_storage_key.isnot(None))
            .order_by(Book.id)
            .limit(1)
        )
        if book_id is not None:
            print(book_id)


asyncio.run(main())
PY
)
book_id=$(tr -d '[:space:]' <<<"$book_id")

if [ -n "$book_id" ] && [ -n "$HEALTH_TOKEN" ]; then
    range_headers=$(curl -sS -D - -o /dev/null -r 0-1023 \
        -H "Authorization: Bearer $HEALTH_TOKEN" \
        "$BASE/api/books/$book_id/pdf" 2>/dev/null || true)
    range_code=$(awk '/^HTTP\// { code=$2 } END { print code }' <<<"$range_headers")
    if [ "$range_code" = "206" ] \
        && grep -qi '^Content-Range: bytes 0-' <<<"$range_headers"; then
        ok "PDF поддерживает authenticated Range (206)"
    else
        fail "authenticated Range не подтверждён (HTTP ${range_code:-нет ответа})" \
            "задайте токен read-only пользователя в AEGIS_HEALTH_TOKEN"
    fi
elif [ -n "$book_id" ]; then
    unauth_code=$(curl -s -o /dev/null -w '%{http_code}' -r 0-1023 \
        "$BASE/api/books/$book_id/pdf" 2>/dev/null)
    if [ "$unauth_code" = "401" ]; then
        ok "PDF требует авторизации"
    else
        fail "PDF без токена отвечает $unauth_code вместо 401"
    fi
    gray "  — для проверки ответа 206 задайте AEGIS_HEALTH_TOKEN"
else
    gray "  — книг с PDF не найдено, authenticated Range проверить нельзя"
fi

# ---------------------------------------------------------------------------
section "API"

health_body=$(curl -s "$BASE/health" 2>/dev/null)
health=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/health" 2>/dev/null)
if [ "$health" = "200" ] && grep -q '"status":"ok"' <<<"$health_body"; then
    ok "/health отвечает (процесс жив)"
else
    fail "/health не подтвердил состояние backend" \
        "HTTP $health, ответ: $(echo "$health_body" | head -c 120)"
fi

# /ready проверяет зависимости: базу, Redis, хранилище. Одним запросом видно
# то, ради чего раньше приходилось смотреть каждый сервис по отдельности.
ready_body=$(curl -s "$BASE/ready" 2>/dev/null)
ready_code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/ready" 2>/dev/null)
if [ "$ready_code" = "200" ] \
    && grep -q '"database":{"ok":true' <<<"$ready_body" \
    && grep -q '"redis":{"ok":true' <<<"$ready_body" \
    && grep -q '"storage":{"ok":true' <<<"$ready_body"; then
    ok "/ready: обязательные зависимости доступны"
else
    fail "/ready не подтвердил обязательные зависимости" \
        "HTTP $ready_code, ответ: $(echo "$ready_body" | head -c 300)"
fi

# Каталог книг закрыт для неавторизованных — проверяем, что защита на месте
books_code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/books" 2>/dev/null)
if [ "$books_code" = "401" ]; then
    ok "каталог требует авторизации"
else
    fail "каталог вернул $books_code вместо 401" "возможно, эндпоинт снова стал публичным"
fi

# ---------------------------------------------------------------------------
section "База и очередь"

if redis-cli ping >/dev/null 2>&1; then
    ok "Redis отвечает"
    keys=$(redis-cli --scan --pattern 'rl:*' 2>/dev/null | wc -l)
    gray "    ключей rate limiting: $keys"

    queued=$(redis-cli zcard arq:queue 2>/dev/null || echo "?")
    gray "    задач в очереди ARQ: $queued"

    metric_rows=$(redis-cli --raw hgetall aegis:worker:metrics 2>/dev/null || true)
    if [ -n "$metric_rows" ]; then
        ok "метрики фоновых задач записываются"
    else
        gray "  — метрик задач пока нет (появятся после первого запуска)"
    fi
else
    fail "Redis недоступен" "без него приложение не стартует в production"
fi

if [ -d "$APP_DIR/backend" ]; then
    cd "$APP_DIR/backend" || exit 1
    if .venv/bin/alembic check >/dev/null 2>&1; then
        ok "схема БД соответствует моделям"
    else
        fail "расхождение схемы и моделей" ".venv/bin/alembic check"
    fi
fi

# ---------------------------------------------------------------------------
section "Фоновые задачи"

# Плановая очистка сессий идёт раз в сутки. Если она перестала выполняться,
# таблицы начнут расти незаметно — узнаем об этом через месяцы.
# Конвейера здесь тоже избегаем — см. пояснение про SIGPIPE и pipefail выше.
cleanup_log=$(journalctl -u aegis-worker --since "36 hours ago" --no-pager 2>/dev/null || true)
if grep -q "Очистка истёкших сессий\|cleanup_expired_sessions" <<<"$cleanup_log"; then
    ok "очистка сессий выполнялась за последние сутки"
else
    gray "  — записей об очистке нет (задача идёт ночью, это нормально сразу после деплоя)"
fi

# Ошибки воркера за сутки: индексация книг падает молча, в интерфейсе это
# выглядит просто как «поиск ничего не находит».
worker_errors=$(journalctl -u aegis-worker --since "24 hours ago" --no-pager 2>/dev/null \
    | grep -ci "traceback\|ошибка индексации" || true)
if [ "$worker_errors" -eq 0 ]; then
    ok "воркер без ошибок за сутки"
else
    fail "у воркера $worker_errors ошибок за сутки" "journalctl -u aegis-worker --since '24 hours ago'"
fi

# ---------------------------------------------------------------------------
section "Диск и логи"

disk_use=$(df --output=pcent / | tail -1 | tr -dc '0-9')
if [ "$disk_use" -lt 85 ]; then
    ok "диск занят на ${disk_use}%"
else
    fail "диск занят на ${disk_use}%" "проверьте /opt/aegis/backend/storage и journalctl --disk-usage"
fi

journal_size=$(journalctl --disk-usage 2>/dev/null | grep -o '[0-9.]*[GM]' | head -1)
if [ -n "$journal_size" ]; then
    gray "    журнал занимает: $journal_size"
fi

# ---------------------------------------------------------------------------
section "Сертификат"

expiry=$(echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)

if [ -n "$expiry" ]; then
    days_left=$(( ( $(date -d "$expiry" +%s) - $(date +%s) ) / 86400 ))
    if [ "$days_left" -gt 14 ]; then
        ok "TLS-сертификат действителен ещё $days_left дн."
    else
        fail "сертификат истекает через $days_left дн." "certbot renew"
    fi
else
    fail "не удалось прочитать сертификат"
fi

# ---------------------------------------------------------------------------
printf '\n'
if [ "$failed" -eq 0 ]; then
    green "Все проверки пройдены ($checks)"
    exit 0
else
    red "Проблем: $failed из $checks"
    exit 1
fi
