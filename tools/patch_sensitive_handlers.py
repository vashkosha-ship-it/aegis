"""Разметка: одноразовое значение для разрушительных кнопок и безопасный fallback.

Две правки, обе про одно — внедрённая в страницу разметка не должна получать
те же возможности, что и своя.

Первая. Реестр разрешённых обработчиков защищает от вызова произвольной
функции, но не от вызова опасной: в нём законно присутствуют deleteBook,
deleteAdminUser и подобные, потому что они действительно нужны кнопкам в
интерфейсе. Внедрённая разметка может нарисовать такую кнопку, и пользователь
нажмёт её сам. Теперь разрушительные обработчики требуют data-nonce со
значением, которое генерируется при загрузке страницы: свой код подставляет
его через sensitiveNonce(), внедрённый — не может, потому что это заранее
заготовленный текст без возможности что-либо прочитать.

Вторая. replaceWithFallback присваивал outerHTML содержимое атрибута, то есть
исполнял произвольную разметку. Теперь атрибут выбирает вариант из известного
списка, а не описывает его.

Запуск из корня проекта:
    python tools/patch_sensitive_handlers.py           # показать
    python tools/patch_sensitive_handlers.py --apply   # записать
"""
from __future__ import annotations

import re
import shutil
import sys
from pathlib import Path

FRONTEND = Path("frontend")
FILES = [FRONTEND / "app.js", FRONTEND / "index.html"]

# Обработчики, меняющие данные необратимо или затрагивающие чужие записи.
# Список ведётся вручную и намеренно: он отвечает на вопрос «что страшно
# нажать по ошибке», а на него не ответит ни одна эвристика по имени.
SENSITIVE = [
    # Администрирование
    "approvePendingUser",
    "rejectPendingUser",
    "deleteAdminUser",
    "deleteBook",
    "regenerateAllQuizzesUI",
    "regenerateBookQuiz",
    # Чужой и свой контент
    "deleteComment",
    "deleteReview",
    "deleteReviewAndRefresh",
    "deleteAnnotation",
    "deleteAnnotationFromTooltip",
    "deleteChatFromHistory",
    "deleteCurrentAvatar",
    # Аккаунт целиком
    "confirmDeleteAccount",
    "doDeleteAccount",
    "exportAllUserData",
]

# Точечные замены разметки, которую нельзя починить общим правилом.
MARKUP_REPLACEMENTS = [
    (
        # Два вызова в одном атрибуте: диспетчер выполняет только один, и
        # кнопка не работала. Логика переехала в помощник.
        (
            'data-onclick="deleteReview(${r.bookId}, ${r.id}); '
            'loadAndRenderAdminReviews()"'
        ),
        'data-onclick="deleteReviewAndRefresh(${r.bookId}, ${r.id})"',
    ),
]

# Замены для подмены обложки: раньше в атрибуте лежала разметка, теперь — имя
# варианта. Ключ — исходный текст, значение — чем заменить.
FALLBACK_REPLACEMENTS = [
    (
        'data-fallback="${ICONS.bookCover.replace(/"/g, \'&quot;\')}"',
        'data-fallback="cover"',
    ),
    (
        (
            'data-fallback="<div class=&quot;cover-bg&quot;>'
            '${ICONS.bookCover.replace(/"/g, \'&quot;\')}</div>"'
        ),
        'data-fallback="coverBg"',
    ),
    (
        'data-fallback="${eh(r.avatar)}"',
        (
            'data-fallback="text" data-fallback-text="${eh(r.avatar)}" '
            'data-fallback-class="review-avatar-fallback"'
        ),
    ),
]


def _handler_end(text: str, start: int) -> int | None:
    """Найти закрывающую кавычку атрибута data-onclick.

    Простое [^"]* здесь не работает: в разметке встречается
    data-onclick="deleteAdminUser(${u.id}, '${eh(u.username).replace(/\'/g, "…")}')"
    — внутри значения есть свои двойные кавычки, и шаблон обрывается на них.

    Идём от открывающей кавычки и считаем скобки: атрибут заканчивается там,
    где закрылась последняя скобка вызова. Это переживает любые кавычки внутри.
    """
    depth = 0
    i = start
    while i < len(text):
        char = text[i]
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth == 0:
                # После вызова должна идти закрывающая кавычка атрибута
                return i + 1 if text[i + 1:i + 2] == '"' else None
        elif char == "\n":
            return None  # атрибут не может переноситься на другую строку
        i += 1
    return None


def _handler_spans(text: str, name: str) -> list[tuple[int, int]]:
    """Границы всех атрибутов data-onclick для данной функции."""
    spans = []
    marker = f'data-onclick="{name}('
    pos = 0
    while True:
        found = text.find(marker, pos)
        if found == -1:
            return spans
        end = _handler_end(text, found + len(marker) - 1)
        if end is not None:
            spans.append((found, end + 1))
            pos = end
        else:
            pos = found + len(marker)


def add_nonce(text: str) -> tuple[str, int]:
    """Добавить data-nonce к разрушительным кнопкам, где его ещё нет."""
    total = 0
    for name in SENSITIVE:
        # Идём с конца, чтобы вставки не сдвигали ещё не обработанные границы
        for start, end in reversed(_handler_spans(text, name)):
            if text[end:end + 12].lstrip().startswith("data-nonce"):
                continue
            text = text[:end] + ' data-nonce="${sensitiveNonce()}"' + text[end:]
            total += 1
    return text, total


def fix_fallbacks(text: str) -> tuple[str, int]:
    total = 0
    for old, new in FALLBACK_REPLACEMENTS:
        count = text.count(old)
        if count:
            text = text.replace(old, new)
            total += count
    return text, total


def main() -> int:
    apply = "--apply" in sys.argv
    missing = [f for f in FILES if not f.exists()]
    if missing:
        print("Не найдены (запускай из корня проекта):", *missing, sep="\n  ")
        return 1

    patched: dict[Path, str] = {}
    for path in FILES:
        text = path.read_text(encoding="utf-8")
        for old_markup, new_markup in MARKUP_REPLACEMENTS:
            text = text.replace(old_markup, new_markup)
        text, nonces = add_nonce(text)
        text, fallbacks = fix_fallbacks(text)
        patched[path] = text
        print(f"  {path.name}: nonce {nonces}, fallback {fallbacks}")

    # Контроль: не осталось ли разрушительной кнопки без nonce
    # Проверяем ПО-ДРУГОМУ, а не тем же шаблоном, которым вставляли: иначе
    # проверка повторит его ошибку и промолчит. Ищем упоминание функции
    # простым поиском и смотрим, есть ли поблизости nonce.
    leftovers = []
    for path, text in patched.items():
        for name in SENSITIVE:
            marker = f'data-onclick="{name}('
            pos = 0
            while True:
                found = text.find(marker, pos)
                if found == -1:
                    break
                pos = found + len(marker)
                window = text[found:found + 400]
                if "data-nonce" not in window:
                    line = text.count("\n", 0, found) + 1
                    leftovers.append(f"{path.name}:{line} {name}")

    if leftovers:
        print("\nБез nonce остались (кнопка перестанет работать):")
        for item in leftovers:
            print("  " + item)
        return 1

    # И не осталось ли разметки в data-fallback
    for path, text in patched.items():
        for match in re.finditer(r'data-fallback="([^"]*)"', text):
            value = match.group(1)
            if value not in ("cover", "coverBg", "text"):
                line = text.count("\n", 0, match.start()) + 1
                print(f"\n  {path.name}:{line} неизвестный fallback: {value[:60]}")
                return 1

    if not apply:
        print("\nЭто был просмотр. Для записи: "
              "python tools/patch_sensitive_handlers.py --apply")
        return 0

    for path, text in patched.items():
        shutil.copy2(path, path.with_suffix(path.suffix + ".pre-nonce"))
        path.write_text(text, encoding="utf-8")

    print("\nЗаписано. Копии — рядом с .pre-nonce")
    return 0


if __name__ == "__main__":
    sys.exit(main())
