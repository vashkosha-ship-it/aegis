"""Доводит перевод на async: находит синхронные функции, внутри которых await.

Предыдущие скрипты искали функции по именам (_guard_*) и пропустили
_record_email_send. Здесь имена не при чём: файл разбирается через ast, и
находится любая обычная def, в теле которой есть await. Такая функция —
синтаксическая ошибка, поэтому пропустить её нельзя.

Дальше скрипт делает две вещи: объявляет найденные функции async и добавляет
await к их вызовам во всех указанных файлах. Запускать можно повторно.

Запуск из корня проекта:
    python tools/fix_async_defs.py           # показать
    python tools/fix_async_defs.py --apply   # записать
"""
from __future__ import annotations

import ast
import re
import shutil
import sys
from pathlib import Path

FILES = [
    Path("backend/app/api/auth.py"),
    Path("backend/app/api/me.py"),
    Path("backend/app/api/assistant.py"),
]


def sync_defs_with_await(source: str) -> list[str]:
    """Имена обычных def, в теле которых встречается await."""
    try:
        tree = ast.parse(source)
    except SyntaxError:
        # Файл уже сломан именно этим — разбираем построчно как запасной путь
        return _fallback_scan(source)

    found: list[str] = []

    class Visitor(ast.NodeVisitor):
        def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
            if any(isinstance(n, ast.Await) for n in ast.walk(node)):
                found.append(node.name)
            for child in node.body:
                self.visit(child)

    Visitor().visit(tree)
    return found


def _fallback_scan(source: str) -> list[str]:
    """Если ast не справился: ищем по отступам.

    Нужен ровно в том случае, ради которого написан скрипт: await внутри
    синхронной функции — это SyntaxError, и ast разобрать файл не сможет.
    """
    found: list[str] = []
    current: str | None = None
    is_async = False

    for line in source.splitlines():
        m = re.match(r"^(async )?def (\w+)\(", line)
        if m:
            current = m.group(2)
            is_async = bool(m.group(1))
            continue
        if current and line and not line[0].isspace():
            current = None  # вышли из тела функции
            continue
        if (current and not is_async
                and re.search(r"\bawait\b", line)
                and current not in found):
            found.append(current)
    return found


def main() -> int:
    apply = "--apply" in sys.argv
    missing = [f for f in FILES if not f.exists()]
    if missing:
        print("Не найдены (запускай из корня проекта):", *missing, sep="\n  ")
        return 1

    sources = {p: p.read_text(encoding="utf-8") for p in FILES}

    # Собираем имена по всем файлам сразу: функция может вызываться не там,
    # где объявлена.
    names: list[str] = []
    for path, text in sources.items():
        found = sync_defs_with_await(text)
        if found:
            print(f"  {path.name}: {', '.join(found)}")
        names.extend(n for n in found if n not in names)

    if not names:
        print("  синхронных функций с await не найдено")
        return 0

    alt = "|".join(re.escape(n) for n in names)
    def_re = re.compile(r"^(?!async )def (" + alt + r")\(", re.MULTILINE)
    call_re = re.compile(r"(?<!await )(?<!def )\b(" + alt + r")\(")

    patched: dict[Path, str] = {}
    for path, text in sources.items():
        text, n_def = def_re.subn(r"async def \1(", text)
        text, n_call = call_re.subn(r"await \1(", text)
        patched[path] = text
        if n_def or n_call:
            print(f"  {path.name}: объявлений {n_def}, вызовов {n_call}")

    # Контроль: файл должен разбираться
    broken = False
    for path, text in patched.items():
        try:
            ast.parse(text)
        except SyntaxError as e:
            print(f"  ОШИБКА в {path.name}, строка {e.lineno}: {e.msg}")
            broken = True

    if broken:
        print("\nНичего не записано.")
        return 1

    # Повторная проверка: не осталось ли новых синхронных функций с await
    # (например, вызов был добавлен в очередную обёртку)
    leftovers = []
    for path, text in patched.items():
        rest = sync_defs_with_await(text)
        if rest:
            leftovers.append(f"{path.name}: {', '.join(rest)}")
    if leftovers:
        print("\nОсталось (запусти скрипт ещё раз):")
        for x in leftovers:
            print("  " + x)

    if not apply:
        print("\nЭто был просмотр. Для записи: python tools/fix_async_defs.py --apply")
        return 0

    for path, text in patched.items():
        shutil.copy2(path, path.with_suffix(path.suffix + ".pre-async"))
        path.write_text(text, encoding="utf-8")
    print("\nЗаписано. Копии — рядом с .pre-async")
    return 0


if __name__ == "__main__":
    sys.exit(main())
