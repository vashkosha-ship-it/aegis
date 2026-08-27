"""Переводит вызовы rate limiter на await.

Методы лимитеров стали async (см. app/core/rate_limit.py), поэтому каждый
вызов нужно ожидать, а функции-обёртки _guard_* — объявить async.

Забытый await не вызывает ошибку сразу: Python создаёт корутину и не
выполняет её. Проверка молча перестаёт работать, а в логе появляется
RuntimeWarning про то, что корутина не была ожидаема. Поэтому скрипт в конце
пересчитывает вызовы и сообщает, если что-то осталось.

Запуск из корня проекта:
    python tools/patch_limiter_await.py           # показать
    python tools/patch_limiter_await.py --apply   # записать
"""
from __future__ import annotations

import re
import shutil
import sys
from pathlib import Path

FILES = [
    Path("backend/app/api/auth.py"),
    Path("backend/app/api/me.py"),
    Path("backend/app/api/assistant.py"),
]

LIMITERS = ("login_limiter", "assistant_limiter", "email_send_limiter",
            "otp_attempt_limiter")
METHODS = ("check_allowed", "record_failure", "record_success", "record", "reset")

# Вызов лимитера, перед которым ещё нет await
CALL_RE = re.compile(
    r"(?<!await )\b(" + "|".join(LIMITERS) + r")\.(" + "|".join(METHODS) + r")\("
)

# Объявления и вызовы функций-обёрток
GUARDS = ("_guard_email_send", "_guard_otp_attempt")
GUARD_DEF_RE = re.compile(r"^def (" + "|".join(GUARDS) + r")\(", re.MULTILINE)
GUARD_CALL_RE = re.compile(
    r"(?<!await )(?<!def )\b(" + "|".join(GUARDS) + r")\("
)


def patch(text: str) -> tuple[str, dict[str, int]]:
    counts = {}
    text, counts["вызовы лимитеров"] = CALL_RE.subn(r"await \1.\2(", text)
    text, counts["объявления _guard"] = GUARD_DEF_RE.subn(r"async def \1(", text)
    text, counts["вызовы _guard"] = GUARD_CALL_RE.subn(r"await \1(", text)
    return text, counts


def main() -> int:
    apply = "--apply" in sys.argv
    missing = [f for f in FILES if not f.exists()]
    if missing:
        print("Не найдены (запускай из корня проекта):", *missing, sep="\n  ")
        return 1

    results = {}
    for path in FILES:
        original = path.read_text(encoding="utf-8")
        patched, counts = patch(original)
        results[path] = patched

        total = sum(counts.values())
        detail = ", ".join(f"{k}: {v}" for k, v in counts.items() if v)
        print(f"  {path.name}: {total}" + (f"  ({detail})" if detail else ""))

        left = CALL_RE.findall(patched)
        if left:
            print(f"    ОСТАЛОСЬ без await: {left}")

    # Объявления async def _guard должны совпасть по числу с их наличием
    for path, patched in results.items():
        for guard in GUARDS:
            if f"def {guard}(" in patched and f"async def {guard}(" not in patched:
                print(f"    {path.name}: {guard} остался синхронным")

    if not apply:
        print("\nЭто был просмотр. Для записи: python tools/patch_limiter_await.py --apply")
        return 0

    for path, patched in results.items():
        shutil.copy2(path, path.with_suffix(path.suffix + ".pre-await"))
        path.write_text(patched, encoding="utf-8")
    print("\nЗаписано. Копии до правки — рядом с .pre-await")
    return 0


if __name__ == "__main__":
    sys.exit(main())
