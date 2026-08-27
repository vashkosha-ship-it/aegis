"""Пересобирает frontend/handler-allowlist.js из разметки.

Запускать после добавления любого нового data-on* обработчика: диспетчер
вызывает только то, что перечислено в реестре, поэтому забытая функция просто
перестанет работать. Тест dispatcher.test.js ловит такое расхождение.

Запуск из корня проекта:
    python tools/gen_allowlist.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

FRONTEND = Path("frontend")
SOURCES = [FRONTEND / "app.js", FRONTEND / "index.html"]
OUT = FRONTEND / "handler-allowlist.js"

# Обработчики, добавляемые не из разметки, а из кода
EXTRA = {"click": {"closeModal", "clickElement"}}

# События, возникающие без участия пользователя. Для них список ведётся
# вручную и намеренно узкий — всё, что сюда попадёт, будет исполняться
# автоматически, стоит внедрить нужный тег в DOM.
AUTO_EVENTS = {"error": ["replaceWithFallback"]}

ATTR_RE = re.compile(r'data-on([a-z]+)\s*=\s*(["\'])(.*?)\2', re.S)
CALL_RE = re.compile(r"^\s*([A-Za-z_$][\w$]*)\s*\(")

HEADER = """/* Реестр функций, которые разрешено вызывать из разметки.
 *
 * Зачем он нужен. Диспетчер раньше брал функцию по имени прямо из window —
 * то есть любая разметка, попавшая в DOM, могла позвать ЛЮБУЮ глобальную
 * функцию приложения. Строка вида
 *
 *     <img src=x data-onerror="deleteAdminUser(1)">
 *
 * выполнилась бы сама, без единого клика: событие error возникает при
 * неудачной загрузке картинки. CSP тут не помогает — инлайнового скрипта нет,
 * есть атрибут.
 *
 * Файл собирается автоматически: tools/gen_allowlist.py
 * Править руками не нужно — правки затрутся при следующей пересборке.
 */
window.AEGIS_ALLOWED_HANDLERS = Object.freeze({
"""

AUTO_NOTE = """
  /* События, возникающие БЕЗ действия пользователя, — отдельный, куда более
   * узкий список. error срабатывает сам, стоит браузеру не загрузить
   * картинку, поэтому здесь допустима ровно одна функция: подстановка
   * запасной обложки. Каждая добавленная сюда запись исполняется
   * автоматически, так что расширять список без крайней нужды не следует.
   */
"""


def collect() -> dict[str, set[str]]:
    found: dict[str, set[str]] = {}
    unparsed: list[str] = []

    for path in SOURCES:
        if not path.exists():
            print(f"Не найден {path} — запускай из корня проекта")
            sys.exit(1)
        text = path.read_text(encoding="utf-8", errors="replace")
        for event, _, code in ATTR_RE.findall(text):
            code = code.strip()
            if not code:
                continue
            m = CALL_RE.match(code)
            if m:
                found.setdefault(event, set()).add(m.group(1))
            else:
                unparsed.append(f"{path.name}: {event} -> {code[:70]}")

    if unparsed:
        print("Не разобраны как вызов функции (диспетчер их не выполнит):")
        for u in unparsed:
            print("  " + u)

    for event, names in EXTRA.items():
        found.setdefault(event, set()).update(names)

    return found


def render_list(names: list[str], per_line: int = 3) -> str:
    lines, chunk = [], []
    for name in names:
        chunk.append(f"'{name}'")
        if len(chunk) == per_line:
            lines.append("    " + ", ".join(chunk) + ",")
            chunk = []
    if chunk:
        lines.append("    " + ", ".join(chunk) + ",")
    return "\n".join(lines)


def main() -> int:
    found = collect()
    parts = [HEADER]

    for event in ("click", "change", "input", "keydown", "keyup", "submit"):
        if event in found:
            parts.append(f"  {event}: [\n{render_list(sorted(found[event]))}\n  ],\n")

    parts.append(AUTO_NOTE)
    for event, allowed in AUTO_EVENTS.items():
        actual = found.get(event, set())
        extra = actual - set(allowed)
        if extra:
            print(f"\nВНИМАНИЕ: в разметке есть data-on{event} с функциями вне "
                  f"списка автоматических: {', '.join(sorted(extra))}")
            print("Проверь, действительно ли им можно выполняться без действия "
                  "пользователя, и добавь в AUTO_EVENTS осознанно.")
        parts.append(f"  {event}: [\n{render_list(allowed)}\n  ],\n")

    parts.append("});\n")
    OUT.write_text("".join(parts), encoding="utf-8")

    total = sum(len(v) for v in found.values())
    print(f"\n{OUT}: {total} функций")
    return 0


if __name__ == "__main__":
    sys.exit(main())
