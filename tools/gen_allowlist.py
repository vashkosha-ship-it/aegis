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

# Разрушительные обработчики: удаляют данные, затрагивают чужие записи или
# административные операции. Для них реестра мало — внедрённая разметка может
# нарисовать кнопку «Удалить» с разрешённым именем, и пользователь нажмёт её
# сам. Поэтому диспетчер дополнительно требует data-nonce со значением,
# сгенерированным при загрузке страницы.
#
# Список ведётся вручную и намеренно: он отвечает на вопрос «что страшно
# нажать по ошибке», а на такой вопрос эвристика по имени не отвечает.
# resetFilters и clearAssistantChat тоже начинаются с «опасных» слов, но лишь
# меняют вид на экране.
SENSITIVE = [
    "approvePendingUser",
    "rejectPendingUser",
    "deleteAdminUser",
    "deleteBook",
    "regenerateAllQuizzesUI",
    "regenerateBookQuiz",
    "deleteComment",
    "deleteReview",
    "deleteReviewAndRefresh",
    "deleteAnnotation",
    "deleteAnnotationFromTooltip",
    "deleteChatFromHistory",
    "deleteCurrentAvatar",
    "confirmDeleteAccount",
    "doDeleteAccount",
    "exportAllUserData",
]

# События, возникающие без участия пользователя. Для них список ведётся
# вручную и намеренно узкий — всё, что сюда попадёт, будет исполняться
# автоматически, стоит внедрить нужный тег в DOM.
AUTO_EVENTS = {"error": ["replaceWithFallback"]}

ATTR_RE = re.compile(r'data-on([a-z]+)\s*=\s*(["\'])(.*?)\2', re.DOTALL)
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

SENSITIVE_NOTE = """
  /* Разрушительные обработчики. Они перечислены и в списке своего события —
   * реестр их пропускает, — но диспетчер дополнительно требует data-nonce.
   * Одного реестра мало: он не даёт позвать произвольную функцию, но не мешает
   * позвать опасную, ведь удаление книги нужно настоящей кнопке в интерфейсе.
   */
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

    known = {name for names in found.values() for name in names}
    missing = [name for name in SENSITIVE if name not in known]
    if missing:
        print("\nВ разметке нет обработчиков из списка разрушительных: "
              + ", ".join(missing))
        print("Либо кнопку удалили, либо имя изменилось — уточните SENSITIVE.")

    parts.append(SENSITIVE_NOTE)
    parts.append(f"  sensitive: [\n{render_list(sorted(SENSITIVE))}\n  ],\n")

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
