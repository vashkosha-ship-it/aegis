#!/usr/bin/env bash
#
# Развёртывание Aegis на сервере.
#
# Главное, ради чего скрипт существует: он отказывается разворачивать коммит,
# у которого сборка не зелёная. За время работы мы трижды выкатывали
# нерабочее — не доехавший конфиг nginx, неподключённый реестр обработчиков,
# сломанные кнопки. Каждый раз проверки в CI были или красными, или ещё шли, а
# `git pull` об этом ничего не знал.
#
# Запуск:
#   cd /opt/aegis && ./deploy.sh
#
# Разрешить выкатку при незелёной сборке (только осознанно, например при
# откате на заведомо рабочий коммит):
#   ./deploy.sh --force
#
# Вернуться на предыдущий развёрнутый коммит:
#   ./deploy.sh --rollback
#
# Для приватного репозитория или чтобы не упереться в ограничение запросов,
# положите токен в /opt/aegis/.deploy-token (права 600) или задайте
# GITHUB_TOKEN в окружении.

set -euo pipefail

REPO_DIR="/opt/aegis"
BACKEND_DIR="$REPO_DIR/backend"
FRONTEND_SRC="$REPO_DIR/frontend/"
FRONTEND_DST="/var/www/aegis/"
NGINX_SNIPPET="/etc/nginx/snippets/aegis-security-headers.conf"
REPO_SNIPPET="$REPO_DIR/backend/deploy/aegis-security-headers.conf"
LAST_DEPLOY_FILE="$REPO_DIR/.last-deployed-commit"
TOKEN_FILE="$REPO_DIR/.deploy-token"

GITHUB_REPO="vashkosha-ship-it/aegis"

# Проверки, без которых выкатка запрещена. Имена — как в ci.yml.
# e2e сюда не входит намеренно: он запускается вручную и по расписанию, а не
# на каждый коммит, поэтому для свежего коммита его результата просто нет.
# Требовать его — значит блокировать любую выкатку.
REQUIRED_JOBS="backend security"

FORCE=0
ROLLBACK=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --rollback) ROLLBACK=1 ;;
    *) echo "Неизвестный аргумент: $arg"; exit 2 ;;
  esac
done

say() { printf '\n== %s\n' "$1"; }
fail() { printf '\nОШИБКА: %s\n' "$1" >&2; exit 1; }

github_token() {
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    echo "$GITHUB_TOKEN"
  elif [ -f "$TOKEN_FILE" ]; then
    tr -d '[:space:]' < "$TOKEN_FILE"
  fi
}

# --- проверка статуса сборки ------------------------------------------------

check_build_status() {
  local sha="$1"
  local token auth_header url response

  token="$(github_token)"
  url="https://api.github.com/repos/$GITHUB_REPO/commits/$sha/check-runs"

  if [ -n "$token" ]; then
    response="$(curl -sS -H "Authorization: Bearer $token" \
      -H "Accept: application/vnd.github+json" "$url")" || return 2
  else
    response="$(curl -sS -H "Accept: application/vnd.github+json" "$url")" || return 2
  fi

  # Разбираем ответ питоном: jq на сервере может не быть, а python есть точно.
  python3 - "$response" "$REQUIRED_JOBS" <<'PYEOF'
import json
import sys

raw, required_line = sys.argv[1], sys.argv[2]
required = required_line.split()

try:
    data = json.loads(raw)
except ValueError:
    print("Не удалось разобрать ответ GitHub")
    sys.exit(2)

if "check_runs" not in data:
    print(f"GitHub ответил без списка проверок: {data.get('message', raw[:200])}")
    sys.exit(2)

runs = {r["name"]: r for r in data["check_runs"]}
if not runs:
    print("Для этого коммита проверок нет — возможно, сборка ещё не началась")
    sys.exit(1)

problems = []
for name in required:
    run = runs.get(name)
    if run is None:
        problems.append(f"{name}: проверки нет")
    elif run["status"] != "completed":
        problems.append(f"{name}: ещё выполняется ({run['status']})")
    elif run["conclusion"] not in ("success", "skipped"):
        problems.append(f"{name}: {run['conclusion']}")

for name, run in sorted(runs.items()):
    mark = "ok  " if run.get("conclusion") in ("success", "skipped") else "FAIL"
    state = run.get("conclusion") or run.get("status")
    print(f"  {mark} {name}: {state}")

if problems:
    print("\nНе пройдены обязательные проверки:")
    for item in problems:
        print(f"  {item}")
    sys.exit(1)
sys.exit(0)
PYEOF
}

# --- откат ------------------------------------------------------------------

if [ "$ROLLBACK" -eq 1 ]; then
  [ -f "$LAST_DEPLOY_FILE" ] || fail "нет записи о предыдущем развёртывании"
  target="$(cat "$LAST_DEPLOY_FILE")"
  say "Откат на $target"
  cd "$REPO_DIR"
  git checkout --quiet "$target"
  "$BACKEND_DIR/.venv/bin/pip" install -q -r "$BACKEND_DIR/requirements.txt"
  rsync -a --delete "$FRONTEND_SRC" "$FRONTEND_DST"
  systemctl restart aegis aegis-worker
  say "Откат выполнен. Проверьте: curl -sS http://127.0.0.1:8000/ready"
  exit 0
fi

# --- обычное развёртывание --------------------------------------------------

cd "$REPO_DIR"

say "Получаю изменения"
git fetch --quiet origin

current="$(git rev-parse HEAD)"
target="$(git rev-parse origin/main)"

if [ "$current" = "$target" ]; then
  say "Уже на последнем коммите ($(git log -1 --format=%s))"
  exit 0
fi

echo "  сейчас:  ${current:0:8} $(git log -1 --format=%s "$current")"
echo "  станет:  ${target:0:8} $(git log -1 --format=%s "$target")"

say "Проверяю сборку коммита ${target:0:8}"
set +e
check_build_status "$target"
status=$?
set -e

if [ "$status" -ne 0 ]; then
  if [ "$FORCE" -eq 1 ]; then
    echo
    echo "ВНИМАНИЕ: сборка не зелёная, но указан --force. Продолжаю."
  else
    echo
    echo "Развёртывание остановлено."
    echo "Дождитесь зелёной сборки или выкатывайте осознанно: ./deploy.sh --force"
    exit 1
  fi
fi

# Запоминаем текущий коммит ДО обновления — иначе откатываться будет некуда.
echo "$current" > "$LAST_DEPLOY_FILE"

say "Обновляю код"
git merge --ff-only origin/main

say "Зависимости"
"$BACKEND_DIR/.venv/bin/pip" install -q -r "$BACKEND_DIR/requirements.txt"

say "Миграции"
(cd "$BACKEND_DIR" && ./.venv/bin/alembic upgrade head)

say "Фронтенд"
rsync -a --delete "$FRONTEND_SRC" "$FRONTEND_DST"

# --- конфигурация nginx -----------------------------------------------------
#
# Снипет с заголовками безопасности копируется, потому что certbot его не
# трогает. Сам конфиг сайта — нет: certbot дописывает туда строки про
# сертификаты, и перезапись положила бы HTTPS.

if [ -f "$REPO_SNIPPET" ]; then
  if ! diff -q "$NGINX_SNIPPET" "$REPO_SNIPPET" >/dev/null 2>&1; then
    say "Обновляю заголовки nginx"
    cp "$NGINX_SNIPPET" "$NGINX_SNIPPET.bak-$(date +%F-%H%M)"
    cp "$REPO_SNIPPET" "$NGINX_SNIPPET"
    if nginx -t; then
      systemctl reload nginx
    else
      fail "конфигурация nginx не проходит проверку — заголовки не применены"
    fi
  fi
fi

say "Перезапускаю сервисы"
systemctl restart aegis aegis-worker

sleep 3
if ! systemctl is-active --quiet aegis; then
  echo
  echo "Сервис не поднялся. Последние строки журнала:"
  journalctl -u aegis -n 20 --no-pager
  echo
  echo "Откат: ./deploy.sh --rollback"
  exit 1
fi

say "Проверяю готовность"
ready="$(curl -sS --max-time 10 http://127.0.0.1:8000/ready || true)"
echo "$ready" | python3 -m json.tool 2>/dev/null || echo "$ready"

case "$ready" in
  *'"status": "ready"'*|*'"status":"ready"'*) ;;
  *'"status": "degraded"'*|*'"status":"degraded"'*)
    echo
    echo "Сервис работает с ограничениями — посмотрите поле degraded выше."
    ;;
  *)
    echo
    echo "Готовность не подтверждена. Откат: ./deploy.sh --rollback"
    exit 1
    ;;
esac

say "Развёрнуто: ${target:0:8} $(git log -1 --format=%s)"
echo
echo "Проверка боевого сайта:"
echo "  python3 tools/verify_deployment.py https://aegis-sec-library.ru"
echo
echo "Откат при необходимости: ./deploy.sh --rollback"
