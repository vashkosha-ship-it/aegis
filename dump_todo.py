"""Выгружает исходные строки вокруг обработчиков, которые кодмод не тронул.

Запуск из корня проекта (после codemod_csp.py --apply):
    python dump_todo.py > todo_context.txt
"""
from __future__ import annotations

from pathlib import Path

# Номера строк из отчёта кодмода
TARGETS = {
    "frontend/app.js": [
        3914, 4007, 4267, 4280, 6322, 6533, 6623,
        7152, 7168, 7539, 7551, 8378, 8386, 9552, 12214,
    ],
    "frontend/index.html": [204, 766],
}

CONTEXT = 2


OUT = Path("todo_context.txt")


def main() -> None:
    chunks: list[str] = []
    for name, lines in TARGETS.items():
        path = Path(name)
        if not path.exists():
            chunks.append(f"# нет файла: {name}")
            continue
        src = path.read_text(encoding="utf-8").splitlines()
        chunks.append(f"\n{'=' * 70}\n{name}\n{'=' * 70}")
        for ln in lines:
            lo = max(1, ln - CONTEXT)
            hi = min(len(src), ln + CONTEXT)
            chunks.append(f"\n--- строка {ln} ---")
            for i in range(lo, hi + 1):
                mark = ">>" if i == ln else "  "
                chunks.append(f"{mark} {i:>6}: {src[i - 1]}")

    OUT.write_text("\n".join(chunks) + "\n", encoding="utf-8")
    print(f"Записано: {OUT} ({len(chunks)} строк)")


if __name__ == "__main__":
    main()
