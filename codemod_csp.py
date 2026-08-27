"""Перенос инлайновых обработчиков в data-on* + вынос инлайнового <script>.

Что делает:
  1. Тело инлайнового <script> из index.html переносит в frontend/inline-boot.js
     и заменяет тег на <script defer src="inline-boot.js">.
  2. Подключает inline-handlers.js перед остальными скриптами.
  3. Обработчики вида fn(литералы) переписывает в data-on<событие>.
  4. Обработчики с this/event помечает data-args и тоже переписывает.
  5. Всё, что не разобрал, оставляет как есть и печатает списком.

Ничего не удаляет: рядом кладёт .bak. Прогонять один раз.

Запуск из корня проекта:
    python codemod_csp.py           # показать, что будет сделано
    python codemod_csp.py --apply   # записать изменения
"""
from __future__ import annotations

import re
import shutil
import sys
from pathlib import Path

FRONTEND = Path("frontend")
INDEX = FRONTEND / "index.html"
APP = FRONTEND / "app.js"
BOOT = FRONTEND / "inline-boot.js"

HANDLER_RE = re.compile(r"""\son([a-z]+)\s*=\s*(["'])(.*?)\2""", re.IGNORECASE | re.DOTALL)
SINGLE_CALL_RE = re.compile(r"^\s*([A-Za-z_$][\w$.]*)\s*\(([\s\S]*)\)\s*;?\s*$")
INLINE_SCRIPT_RE = re.compile(
    r"<script(?![^>]*\bsrc=)([^>]*)>(.*?)</script\s*>", re.IGNORECASE | re.DOTALL
)

skipped: list[tuple[str, int, str]] = []


def convert_handler(path_name: str, text: str, match: re.Match) -> str | None:
    """Вернуть замену для одного обработчика или None, если не по зубам."""
    event, quote, code = match.group(1).lower(), match.group(2), match.group(3)
    body = code.strip()
    if not body:
        return None

    m = SINGLE_CALL_RE.match(body)
    if not m:
        line = text.count("\n", 0, match.start()) + 1
        skipped.append((path_name, line, body))
        return None

    fn, args = m.group(1), m.group(2)

    # this и event нельзя передать через разметку — помечаем, диспетчер добавит
    extra = []
    cleaned_args = args
    if re.search(r"\bevent\b", args):
        if not re.fullmatch(r"\s*event\s*", args):
            line = text.count("\n", 0, match.start()) + 1
            skipped.append((path_name, line, body))
            return None
        cleaned_args = ""
        extra.append("event")
    if re.search(r"\bthis\b", args):
        # this допускаем только как отдельный последний аргумент
        parts = [p.strip() for p in args.split(",")]
        if parts[-1] != "this":
            line = text.count("\n", 0, match.start()) + 1
            skipped.append((path_name, line, body))
            return None
        cleaned_args = ", ".join(parts[:-1])
        extra.append("this")

    if re.search(r"\bthis\b", body) and not extra:
        line = text.count("\n", 0, match.start()) + 1
        skipped.append((path_name, line, body))
        return None

    spec = f"{fn}({cleaned_args})"
    if quote in spec:
        # Кавычка того же типа порвала бы атрибут
        line = text.count("\n", 0, match.start()) + 1
        skipped.append((path_name, line, body))
        return None

    out = f" data-on{event}={quote}{spec}{quote}"
    if extra:
        out += f" data-args={quote}{','.join(extra)}{quote}"
    return out


def process(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    result = []
    pos = 0
    converted = 0

    for m in HANDLER_RE.finditer(text):
        replacement = convert_handler(path.name, text, m)
        if replacement is None:
            continue
        result.append(text[pos:m.start()])
        result.append(replacement)
        pos = m.end()
        converted += 1

    result.append(text[pos:])
    print(f"  {path.name}: переписано {converted}")
    return "".join(result)


def extract_inline_script(html: str) -> tuple[str, str | None]:
    """Вынести тело инлайнового <script> в отдельный файл."""
    m = INLINE_SCRIPT_RE.search(html)
    if not m:
        return html, None
    body = m.group(2)
    replacement = '<script defer src="inline-boot.js"></script>'
    return html[:m.start()] + replacement + html[m.end():], body


def main() -> int:
    apply = "--apply" in sys.argv

    for p in (INDEX, APP):
        if not p.exists():
            print(f"Не найден {p} — запускай из корня проекта")
            return 1

    print("Обработчики:")
    new_app = process(APP)
    new_index = process(INDEX)

    new_index, boot = extract_inline_script(new_index)
    if boot is not None:
        print(f"  вынесено из <script>: {len(boot.splitlines())} строк -> {BOOT.name}")

    # Диспетчер должен подключиться раньше остальных скриптов
    if "inline-handlers.js" not in new_index:
        anchor = '<script defer src="offline-storage.js"></script>'
        if anchor in new_index:
            new_index = new_index.replace(
                anchor, '<script defer src="inline-handlers.js"></script>\n' + anchor, 1
            )
            print("  подключён inline-handlers.js")
        else:
            print("  ВНИМАНИЕ: не нашёл, куда вставить inline-handlers.js — добавь вручную")

    if skipped:
        print(f"\nОсталось переписать руками: {len(skipped)}")
        for name, line, body in skipped:
            print(f"  {name}:{line}  {body[:120]}")

    if not apply:
        print("\nЭто был просмотр. Для записи: python codemod_csp.py --apply")
        return 0

    for p in (INDEX, APP):
        shutil.copy2(p, p.with_suffix(p.suffix + ".bak"))
    APP.write_text(new_app, encoding="utf-8")
    INDEX.write_text(new_index, encoding="utf-8")
    if boot is not None:
        BOOT.write_text(boot.strip() + "\n", encoding="utf-8")

    print("\nЗаписано. Резервные копии рядом с .bak")
    return 0


if __name__ == "__main__":
    sys.exit(main())
