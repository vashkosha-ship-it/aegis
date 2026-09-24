"""Проверка того, что реально отдаёт боевой сервер.

Тесты в backend/tests проверяют файлы в репозитории. Этого мало: файл может
быть правильным, а на сервере лежать прошлая версия. Именно так и вышло
дважды — снипет с новой CSP остался в репозитории и не попал в
/etc/nginx/snippets, а реестр обработчиков не был подключён в отданном
index.html.

Скрипт сравнивает заголовки живого сайта с тем, что записано в
backend/deploy/aegis-security-headers.conf, и проверяет, что все подключённые
стили и скрипты отдаются. Запускать после каждого деплоя.

Запуск из корня проекта:
    python tools/verify_deployment.py https://aegis-sec-library.ru
"""
from __future__ import annotations

import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
HEADERS_CONF = REPO / "backend" / "deploy" / "aegis-security-headers.conf"

TIMEOUT = 15

passed = 0
failed = 0


def check(name: str, ok: bool, detail: str = "") -> None:
    global passed, failed
    if ok:
        passed += 1
        print(f"  ok   {name}")
    else:
        failed += 1
        print(f"  FAIL {name}" + (f"\n         {detail}" if detail else ""))


def fetch(url: str) -> tuple[int, dict[str, str], bytes]:
    request = urllib.request.Request(url, headers={"User-Agent": "aegis-verify"})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            headers = {k.lower(): v for k, v in response.headers.items()}
            return response.status, headers, response.read()
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read()


def expected_csp() -> str | None:
    """Действующая политика из конфига в репозитории (без комментариев)."""
    if not HEADERS_CONF.exists():
        return None
    pattern = re.compile(r'^add_header\s+Content-Security-Policy\s+"(.*)"\s*always\s*;')
    for raw in HEADERS_CONF.read_text(encoding="utf-8").splitlines():
        stripped = raw.strip()
        if stripped.startswith("#"):
            continue
        m = pattern.match(stripped)
        if m:
            return m.group(1)
    return None


def normalise(policy: str) -> set[str]:
    """Политика как набор директив: порядок и лишние пробелы не важны."""
    return {" ".join(d.split()) for d in policy.split(";") if d.strip()}


def main(base: str) -> int:
    base = base.rstrip("/")
    print(f"\nПроверяю {base}")

    status, headers, body = fetch(base + "/")
    check("главная отвечает", status == 200, f"код {status}")
    if status != 200:
        return 1

    print("\nЗаголовки безопасности")
    csp = headers.get("content-security-policy")
    check("Content-Security-Policy отдаётся", csp is not None)

    if csp:
        check(
            "script-src запрещает инлайн",
            "'unsafe-inline'" not in _directive(csp, "script-src"),
            _directive(csp, "script-src"),
        )
        check(
            "script-src запрещает eval",
            "'unsafe-eval'" not in _directive(csp, "script-src"),
            _directive(csp, "script-src"),
        )
        check(
            "style-src запрещает инлайн",
            "'unsafe-inline'" not in _directive(csp, "style-src"),
            _directive(csp, "style-src"),
        )

        wanted = expected_csp()
        if wanted:
            same = normalise(wanted) == normalise(csp)
            check(
                "политика совпадает с конфигом в репозитории",
                same,
                "" if same else (
                    f"на сервере лишнее: {normalise(csp) - normalise(wanted)}\n"
                    f"         в репозитории лишнее: "
                    f"{normalise(wanted) - normalise(csp)}"
                ),
            )
        else:
            check("действующая политика найдена в конфиге", False,
                  f"не разобрал {HEADERS_CONF}")

    check(
        "Report-Only выключен",
        "content-security-policy-report-only" not in headers,
        "режим наблюдения остался включённым",
    )

    for header, must in (
        ("strict-transport-security", "max-age="),
        ("x-content-type-options", "nosniff"),
        ("x-frame-options", "DENY"),
        ("referrer-policy", "strict-origin"),
    ):
        value = headers.get(header, "")
        check(f"{header}", must in value, f"получено: {value or 'нет заголовка'}")

    print("\nПодключённые стили")
    html = body.decode("utf-8", errors="replace")
    stylesheets = [
        href for href in re.findall(
            r'<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"', html
        )
        if not href.startswith(("http://", "https://", "//"))
    ]
    check("стили найдены в разметке", bool(stylesheets))
    stylesheet_bodies = {}
    for href in stylesheets:
        code, _, stylesheet_body = fetch(f"{base}/{href.lstrip('/')}")
        check(f"{href} отдаётся", code == 200, f"код {code}")
        stylesheet_bodies[href.lstrip("/")] = stylesheet_body.decode(
            "utf-8", errors="replace"
        )
    desktop_stability = stylesheet_bodies.get("desktop-stability.css", "")
    check(
        "финальный desktop-layout подключён",
        "Canonical desktop layout overrides" in desktop_stability
        and 'css/components/detail-assistant.css' in desktop_stability,
        "на сервере нет актуального desktop-stability.css",
    )

    print("\nПодключённые скрипты")
    scripts = [
        src for src in re.findall(r'<script[^>]+src="([^"]+)"', html)
        if not src.startswith(("http://", "https://", "//"))
    ]
    check("скрипты найдены в разметке", bool(scripts))

    script_bodies = {}
    for src in scripts:
        code, _, script_body = fetch(f"{base}/{src.lstrip('/')}")
        check(f"{src} отдаётся", code == 200, f"код {code}")
        script_bodies[src.lstrip("/")] = script_body.decode(
            "utf-8", errors="replace"
        )

    core_utils = script_bodies.get("core-utils.js", "")
    check(
        "SVG-иконки создаются в корректном namespace",
        "'text/html'" in core_utils
        and "http://www.w3.org/2000/svg" in core_utils,
        "на сервере старая версия core-utils.js — очистите service worker",
    )

    allowlist = html.find("handler-allowlist.js")
    dispatcher = html.find("inline-handlers.js")
    check(
        "реестр обработчиков подключён раньше диспетчера",
        allowlist != -1 and dispatcher != -1 and allowlist < dispatcher,
        "иначе список пуст и интерфейс не реагирует на нажатия",
    )

    print("\nAPI")
    # Путь зависит от того, под каким префиксом смонтировано приложение:
    # /health объявлен на корне FastAPI, а nginx проксирует /api/. Пробуем
    # оба и считаем успехом любой ответ — задача проверить, что бэкенд жив,
    # а не угадать префикс.
    health_paths = ["/api/health", "/health"]
    reached = False
    for path in health_paths:
        code, _, _ = fetch(base + path)
        if code == 200:
            check(f"{path} отвечает", True)
            reached = True
            break
    if not reached:
        check(
            "бэкенд отвечает на health",
            False,
            f"ни один из путей не ответил 200: {', '.join(health_paths)}",
        )

    ready_code, _, ready_raw = fetch(base + "/ready")
    try:
        readiness = json.loads(ready_raw)
    except (json.JSONDecodeError, UnicodeDecodeError):
        readiness = {}
    queue = readiness.get("checks", {}).get("queue", {})
    check(
        "/ready подтверждает полную готовность",
        ready_code == 200 and readiness.get("status") == "ready",
        f"код {ready_code}, ответ: {ready_raw[:300]!r}",
    )
    check(
        "очередь обязательна и доступна",
        queue.get("required") is True and queue.get("ok") is True,
        f"queue: {queue!r}",
    )

    epub_code, _, _ = fetch(base + "/api/books/0/epub")
    check(
        "EPUB-маршрут существует и требует авторизацию",
        epub_code in {401, 403},
        f"ожидался 401/403, получен код {epub_code}",
    )
    reviews_code, _, _ = fetch(base + "/api/books/0/reviews")
    check(
        "отзывы не доступны анонимно",
        reviews_code in {401, 403},
        f"ожидался 401/403, получен код {reviews_code}",
    )
    storage_audit_code, _, _ = fetch(base + "/api/admin/storage/audit")
    check(
        "аудит хранилища существует и доступен только администратору",
        storage_audit_code in {401, 403},
        f"ожидался 401/403, получен код {storage_audit_code}",
    )
    description_job_code, _, _ = fetch(
        base + "/api/admin/book-descriptions/jobs/latest"
    )
    check(
        "фоновые ИИ-описания доступны только администратору",
        description_job_code in {401, 403},
        f"ожидался 401/403, получен код {description_job_code}",
    )

    print(f"\nИтого: {passed} ok, {failed} fail\n")
    return 0 if failed == 0 else 1


def _directive(policy: str, name: str) -> str:
    for part in policy.split(";"):
        part = part.strip()
        if part.startswith(name + " ") or part == name:
            return part
    return ""


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
