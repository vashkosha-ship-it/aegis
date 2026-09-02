"""Проверка: в app/models не должно быть бизнес-логики и копий сервисов.

Поводом стал реальный случай. В app/models/gamification.py лежала копия
app/services/gamification.py — устаревшая, с ошибкой во вставке достижений,
которую в сервисе давно исправили. Обе версии выглядели рабочими, и понять по
коду, какая из них выполняется, можно было только проследив импорты.

Это худший вид дублирования: правку вносят в одно место, а работает другое.
Мы наступали на это дважды за неделю — с отключённой функцией отрисовки, куда
уходили правки, и с реестром обработчиков, который не был подключён.

Правила простые.

Модуль в app/models описывает данные. Если функция принимает сессию БД, она
делает работу, а не описывает структуру — ей место в app/services.

Имя функции не должно встречаться и в models, и в services: даже если тела
разные, читающему придётся выяснять, какая из них настоящая.

Запуск из корня проекта:
    python tools/check_duplicate_logic.py
"""
from __future__ import annotations

import ast
import sys
from pathlib import Path

MODELS = Path("backend/app/models")
SERVICES = Path("backend/app/services")

# Признак того, что функция делает работу с базой, а не описывает данные.
SESSION_HINTS = ("AsyncSession", "Session", "db")

# Имена, которые законно совпадают: это не логика, а протокол SQLAlchemy
# и обычные соглашения.
ALLOWED_DUPLICATES = {
    "__repr__",
    "__str__",
    "__init__",
}


def _functions(path: Path) -> list[tuple[str, ast.AST]]:
    """Функции верхнего уровня и методы модуля."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found: list[tuple[str, ast.AST]] = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            found.append((node.name, node))
    return found


def _takes_session(node: ast.AST) -> bool:
    for arg in list(node.args.args) + list(node.args.kwonlyargs):
        if arg.arg in SESSION_HINTS:
            return True
        annotation = getattr(arg, "annotation", None)
        if annotation is not None:
            text = ast.unparse(annotation)
            if any(hint in text for hint in SESSION_HINTS):
                return True
    return False


def check_models_have_no_logic() -> list[str]:
    problems = []
    for path in sorted(MODELS.glob("*.py")):
        if path.name == "__init__.py":
            continue
        for name, node in _functions(path):
            if name in ALLOWED_DUPLICATES:
                continue
            if _takes_session(node):
                problems.append(
                    f"{path.relative_to(MODELS.parent.parent)}: {name}() принимает "
                    "сессию БД — это работа, а не описание данных. Место в services."
                )
    return problems


def check_no_duplicate_names() -> list[str]:
    model_names: dict[str, str] = {}
    for path in sorted(MODELS.glob("*.py")):
        if path.name == "__init__.py":
            continue
        for name, _ in _functions(path):
            if not name.startswith("_") and name not in ALLOWED_DUPLICATES:
                model_names[name] = path.name

    problems = []
    for path in sorted(SERVICES.glob("*.py")):
        if path.name == "__init__.py":
            continue
        for name, _ in _functions(path):
            if name in model_names:
                problems.append(
                    f"{name}() объявлена и в models/{model_names[name]}, "
                    f"и в services/{path.name} — непонятно, какая работает"
                )
    return problems


def main() -> int:
    if not MODELS.exists() or not SERVICES.exists():
        print("Не найдены app/models или app/services — запускай из корня проекта")
        return 1

    problems = check_models_have_no_logic() + check_no_duplicate_names()

    if problems:
        print("Логика продублирована или лежит не там:\n")
        for item in problems:
            print("  " + item)
        print(
            "\nМодуль в models описывает структуру данных. Всё, что обращается "
            "к базе, принадлежит services — иначе появляются две версии одного "
            "кода, и та, в которую вносят правки, может оказаться неработающей."
        )
        return 1

    print("Дублирования логики между models и services нет")
    return 0


if __name__ == "__main__":
    sys.exit(main())
