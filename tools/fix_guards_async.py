"""Доводит перевод лимитеров на async: делает _guard_* асинхронными.

Отдельный скрипт, потому что предыдущий добавил await внутрь _guard_*, но
сами функции оставил синхронными — получился SyntaxError. Здесь только это, и
запускать можно сколько угодно раз: уже исправленное не трогается.

Запуск из корня проекта:
    python tools/fix_guards_async.py           # показать
    python tools/fix_guards_async.py --apply   # записать
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

GUARDS = ("_guard_email_send", "_guard_otp_attempt")
LIMITERS = ("login_limiter", "assistant_limiter", "email_send_limiter",
            "otp_attempt_limiter")
METHODS = ("check_allowed", "record_failure", "record_success", "record", "reset")

# def _guard_X(   ->   async def _guard_X(   (только если ещё не async)
DEF_RE = re.compile(
    r"^(?!async )def (" + "|".join(GUARDS) + r")\(", re.MULTILINE
)
# вызов _guard_X( без await и не в объявлении
CALL_RE = re.compile(r"(?<!await )(?<!def )\b(" + "|".join(GUARDS) + r")\(")
# вызов лимитера без await
LIM_RE = re.compile(
    r"(?<!await )\b(" + "|".join(LIMITERS) + r")\.(" + "|".join(METHODS) + r")\("
)


def main() -> int:
    apply = "--apply" in sys.argv
    missing = [f for f in FILES if not f.exists()]
    if missing:
        print("Не найдены (запускай из корня проекта):", *missing, sep="\n  ")
        return 1

    patched: dict[Path, str] = {}
    for path in FILES:
        text = path.read_text(encoding="utf-8")
        text, n_def = DEF_RE.subn(r"async def \1(", text)
        text, n_call = CALL_RE.subn(r"await \1(", text)
        text, n_lim = LIM_RE.subn(r"await \1.\2(", text)
        patched[path] = text

        changes = []
        if n_def:
            changes.append(f"объявлений _guard: {n_def}")
        if n_call:
            changes.append(f"вызовов _guard: {n_call}")
        if n_lim:
            changes.append(f"вызовов лимитеров: {n_lim}")
        print(f"  {path.name}: " + (", ".join(changes) if changes else "нечего менять"))

        # Контроль: await внутри синхронной функции — это SyntaxError,
        # поэтому лучше поймать здесь, чем при импорте приложения.
        for guard in GUARDS:
            if f"def {guard}(" in text and f"async def {guard}(" not in text:
                print(f"    ВНИМАНИЕ: {guard} всё ещё синхронный")

    if not apply:
        print("\nЭто был просмотр. Для записи: python tools/fix_guards_async.py --apply")
        return 0

    for path, text in patched.items():
        shutil.copy2(path, path.with_suffix(path.suffix + ".pre-guards"))
        path.write_text(text, encoding="utf-8")

    # Проверяем, что файлы вообще разбираются
    import ast
    for path in FILES:
        try:
            ast.parse(path.read_text(encoding="utf-8"))
        except SyntaxError as e:
            print(f"\nСИНТАКСИЧЕСКАЯ ОШИБКА в {path}: строка {e.lineno}: {e.msg}")
            return 1

    print("\nЗаписано, синтаксис в порядке. Копии — рядом с .pre-guards")
    return 0


if __name__ == "__main__":
    sys.exit(main())
