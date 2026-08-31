"""Проверка того, что реально отдаёт боевой сервер.

Тесты в backend/tests проверяют файлы в репозитории. Этого мало: файл может
быть правильным, а на сервере лежать прошлая версия. Именно так и вышло
дважды — снипет с новой CSP остался в репозитории и не попал в
/etc/nginx/snippets, а реестр обработчиков не был подключён в отданном
index.html.

Скрипт сравнивает заголовки живого сайта с тем, что записано в
backend/deploy/aegis-security-headers.conf, и проверяет, что все подключённые
скрипты отдаются. Запускать после каждого деплоя.

Запуск из корня проекта:
    python tools/verify_deployment.py https://aegis-sec-library.ru
"""
from __future__ import annotations

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
        return e.code, {k.lower(): v for k, v in e.headers.items()}, b""


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

    print("\nПодключённые скрипты")
    html = body.decode("utf-8", errors="replace")
    scripts = [
        src for src in re.findall(r'<script[^>]+src="([^"]+)"', html)
        if not src.startswith(("http://", "https://", "//"))
    ]
    check("скрипты найдены в разметке", bool(scripts))

    for src in scripts:
        code, _, _ = fetch(f"{base}/{src.lstrip('/')}")
        check(f"{src} отдаётся", code == 200, f"код {code}")

    allowlist = html.find("handler-allowlist.js")
    dispatcher = html.find("inline-handlers.js")
    check(
        "реестр обработчиков подключён раньше диспетчера",
        allowlist != -1 and dispatcher != -1 and allowlist < dispatcher,
        "иначе список пуст и интерфейс не реагирует на нажатия",
    )

    print("\nAPI")
    code, _, _ = fetch(base + "/api/health")
    check("/api/health отвечает", code == 200, f"код {code}")

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
