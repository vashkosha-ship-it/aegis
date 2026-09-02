"""Разбор присваиваний innerHTML/outerHTML: где данные попадают в разметку сырыми.

Само по себе присваивание innerHTML не уязвимость. Опасны те места, где в
шаблон подставляется значение, пришедшее от пользователя или с сервера, без
экранирования. Их и нужно чинить в первую очередь, а не переписывать все
четыреста подряд.

Скрипт разбирает каждую подстановку ${...} внутри присваивания и раскладывает
по трём корзинам:

  безопасно   — число, константа приложения, вызов eh(), тернарник из литералов
  проверить   — вызов функции, результат которой неизвестен
  опасно      — переменная или свойство напрямую

Переписать четыреста мест разом нельзя, поэтому работает защёлка: текущее
состояние записывается в baseline, и сборка падает, если появится НОВАЯ
неэкранированная подстановка. Старые чинятся постепенно, а число их не растёт.

Запуск из корня проекта:
    python tools/audit_innerhtml.py                 # отчёт
    python tools/audit_innerhtml.py --show опасно   # список
    python tools/audit_innerhtml.py --baseline      # зафиксировать состояние
    python tools/audit_innerhtml.py --check         # сравнить с baseline (CI)
"""
from __future__ import annotations

import re
import sys
from collections import Counter
from pathlib import Path

FILES = [Path("frontend/app.js"), Path("frontend/index.html")]
BASELINE = Path("tools/innerhtml-baseline.txt")

ASSIGN_RE = re.compile(r"\.(inner|outer)HTML\s*=")

# Подстановки, которые не могут принести разметку.
SAFE_PATTERNS = [
    re.compile(r"^\s*eh\("),                       # уже экранировано
    re.compile(r"^\s*\d+(\.\d+)?\s*$"),            # число
    re.compile(r"^\s*ICONS\."),                    # константы иконок
    re.compile(r"^\s*[A-Z_][A-Z0-9_]*\s*$"),       # КОНСТАНТА
    re.compile(r"^\s*['\"][^'\"]*['\"]\s*$"),      # строковый литерал
    # Числовые выражения и приведения
    re.compile(r"^\s*[\w.]+\s*\?\s*\d"),
    re.compile(r"^\s*Math\."),
    re.compile(r"^\s*Number\("),
    re.compile(r"^\s*parseInt\("),
    re.compile(r"^\s*JSON\.stringify\("),
    # Идентификаторы, которые заведомо числовые
    re.compile(r"^\s*\w*[Ii]d\s*$"),
    re.compile(r"^\s*\w+\.id\s*$"),
    re.compile(r"^\s*pct\s*$"),
]

# Подстановка выглядит как вызов — что вернёт, по строке не понять
CALL_RE = re.compile(r"^\s*[\w.]+\s*\(")


def _find_interpolations(text: str, start: int, limit: int = 4000) -> list[str]:
    """Собрать содержимое всех ${...} после позиции присваивания."""
    chunk = text[start:start + limit]
    found = []
    i = 0
    while True:
        j = chunk.find("${", i)
        if j == -1:
            break
        depth = 1
        k = j + 2
        while k < len(chunk) and depth:
            if chunk[k] == "{":
                depth += 1
            elif chunk[k] == "}":
                depth -= 1
            k += 1
        found.append(chunk[j + 2:k - 1])
        i = k
    return found


def _statement_end(text: str, start: int) -> int:
    """Конец присваивания: считаем обратные кавычки и скобки."""
    i = start
    in_template = False
    while i < len(text):
        char = text[i]
        if char == "`":
            in_template = not in_template
        elif char == ";" and not in_template or char == "\n" and not in_template:
            return i
        i += 1
    return len(text)


def classify(expr: str) -> str:
    expr = expr.strip()
    if not expr:
        return "безопасно"
    for pattern in SAFE_PATTERNS:
        if pattern.match(expr):
            return "безопасно"
    # Тернарник, обе ветки которого — литералы или иконки
    if "?" in expr and "eh(" not in expr:
        branches = re.split(r"[?:]", expr)
        if all(
            not b.strip() or any(p.match(b) for p in SAFE_PATTERNS)
            for b in branches[1:]
        ):
            return "безопасно"
    if CALL_RE.match(expr):
        return "проверить"
    return "опасно"


def _collect() -> dict[str, list[str]]:
    """Все небезопасные подстановки: ключ — вид, значение — нормализованные записи.

    В запись не входит номер строки: иначе любая правка выше по файлу
    выглядела бы как новое нарушение, и защёлка быстро стала бы помехой.
    """
    result: dict[str, list[str]] = {}
    for path in FILES:
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for match in ASSIGN_RE.finditer(text):
            end = _statement_end(text, match.end())
            for expr in _find_interpolations(text, match.end(), end - match.end() + 1):
                kind = classify(expr)
                if kind == "безопасно":
                    continue
                entry = f"{path.name}\t{' '.join(expr.split())[:120]}"
                result.setdefault(kind, []).append(entry)
    return result


def write_baseline() -> int:
    found = _collect()
    entries = sorted({e for items in found.values() for e in items})
    BASELINE.parent.mkdir(parents=True, exist_ok=True)
    BASELINE.write_text(
        "# Подстановки в innerHTML, требующие внимания, на момент фиксации.\n"
        "# Файл нужен защёлке: новая запись валит сборку, старые чинятся\n"
        "# постепенно. Уменьшать список можно и нужно; увеличивать — только\n"
        "# осознанно, вместе с объяснением в коммите.\n"
        "#\n"
        "# Пересобрать: python tools/audit_innerhtml.py --baseline\n\n"
        + "\n".join(entries) + "\n",
        encoding="utf-8",
    )
    print(f"Зафиксировано записей: {len(entries)} -> {BASELINE}")
    return 0


def check_against_baseline() -> int:
    if not BASELINE.exists():
        print(f"Нет {BASELINE}. Создать: python tools/audit_innerhtml.py --baseline")
        return 1

    known = {
        line.strip()
        for line in BASELINE.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    }
    found = _collect()
    current = {e for items in found.values() for e in items}

    new = sorted(current - known)
    fixed = sorted(known - current)

    if fixed:
        print(f"Исправлено с прошлой фиксации: {len(fixed)}")
        print("Обновите baseline: python tools/audit_innerhtml.py --baseline")

    if new:
        print(f"\nНОВЫЕ неэкранированные подстановки: {len(new)}")
        for entry in new:
            name, expr = entry.split("\t", 1)
            print(f"  {name}: ${{{expr}}}")
        print(
            "\nЗначение из данных пользователя нужно пропускать через eh(). "
            "Если подстановка заведомо безопасна — например, это число или "
            "константа, — объясните это в коммите и пересоберите baseline."
        )
        return 1

    print(f"Новых нарушений нет (в baseline {len(known)} записей)")
    return 0


def main() -> int:
    if "--baseline" in sys.argv:
        return write_baseline()
    if "--check" in sys.argv:
        return check_against_baseline()

    show = None
    if "--show" in sys.argv:
        idx = sys.argv.index("--show")
        if idx + 1 < len(sys.argv):
            show = sys.argv[idx + 1]

    grand = Counter()
    examples: dict[str, list[str]] = {}

    for path in FILES:
        if not path.exists():
            print(f"Не найден {path} — запускай из корня проекта")
            return 1

        text = path.read_text(encoding="utf-8", errors="replace")
        stats = Counter()
        assignments = 0

        for match in ASSIGN_RE.finditer(text):
            assignments += 1
            end = _statement_end(text, match.end())
            for expr in _find_interpolations(text, match.end(), end - match.end() + 1):
                kind = classify(expr)
                stats[kind] += 1
                if kind != "безопасно":
                    line = text.count("\n", 0, match.start()) + 1
                    examples.setdefault(kind, []).append(
                        f"{path.name}:{line}  ${{{expr.strip()[:90]}}}"
                    )

        print(f"\n=== {path.name} ===")
        print(f"присваиваний innerHTML/outerHTML: {assignments}")
        total = sum(stats.values())
        print(f"подстановок внутри них: {total}")
        for kind in ("безопасно", "проверить", "опасно"):
            if stats[kind]:
                share = stats[kind] / total * 100 if total else 0
                print(f"  {kind:<10} {stats[kind]:>5}  ({share:.0f}%)")
        grand.update(stats)

    print("\n=== итого ===")
    for kind in ("безопасно", "проверить", "опасно"):
        print(f"  {kind:<10} {grand[kind]}")

    if show and show in examples:
        seen = set()
        unique = []
        for item in examples[show]:
            key = item.split("  ", 1)[-1]
            if key not in seen:
                seen.add(key)
                unique.append(item)
        print(f"\n=== {show}: {len(unique)} различных подстановок ===")
        for item in unique:
            print("  " + item)
    elif not show:
        print("\nПодробности: --show опасно  или  --show проверить")

    return 0


if __name__ == "__main__":
    sys.exit(main())
