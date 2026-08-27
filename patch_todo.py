"""Переписывает 18 обработчиков, которые кодмод не смог разобрать сам.

Замены точечные: каждая строка ищется целиком и заменяется целиком. Если
что-то не найдено или найдено не столько раз, сколько ожидается, скрипт
ничего не пишет и говорит, где расхождение.

Запуск из корня проекта:
    python patch_todo.py           # проверить
    python patch_todo.py --apply   # записать
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

APP = Path("frontend/app.js")
INDEX = Path("frontend/index.html")

# (что ищем, на что меняем, сколько раз ожидаем встретить)
APP_PATCHES: list[tuple[str, str, int]] = [
    # Ответ на комментарий: одиночный вызов, кодмод споткнулся о кавычку внутри
    (
        r'''onclick="startReply(${c.id}, '${name.replace(/'/g, "\\'")}')"''',
        r'''data-onclick="startReply(${c.id}, '${name.replace(/'/g, "\\'")}')"''',
        1,
    ),
    # Удаление пользователя: та же история
    (
        r'''onclick="deleteAdminUser(${u.id}, '${eh(u.username).replace(/'/g, "\\'")}')"''',
        r'''data-onclick="deleteAdminUser(${u.id}, '${eh(u.username).replace(/'/g, "\\'")}')"''',
        1,
    ),
    # Категория в избранном: аргумент — JSON-строка
    (
        r'''onclick="toggleFavCategory(${JSON.stringify(c).replace(/"/g, '&quot;')})"''',
        r'''data-onclick="toggleFavCategory(${JSON.stringify(c).replace(/"/g, '&quot;')})"''',
        1,
    ),
    # Аватар в отзыве: подмена при ошибке загрузки
    (
        r'''onerror="this.outerHTML='${eh(r.avatar)}'"''',
        r'''data-onerror="replaceWithFallback()" data-args="this" data-fallback="${eh(r.avatar)}"''',
        1,
    ),
    # Обложка книги: встречается дважды (рекомендации и карточка)
    (
        r'''onerror="this.outerHTML='${ICONS.bookCover.replace(/"/g, '&quot;')}'"''',
        r'''data-onerror="replaceWithFallback()" data-args="this" data-fallback="${ICONS.bookCover.replace(/"/g, '&quot;')}"''',
        2,
    ),
    # Обложка в сетке: запасной вариант обёрнут в div
    (
        r'''onerror="this.outerHTML='<div class=&quot;cover-bg&quot;>${ICONS.bookCover.replace(/"/g, '&quot;')}</div>'"''',
        r'''data-onerror="replaceWithFallback()" data-args="this" data-fallback="<div class=&quot;cover-bg&quot;>${ICONS.bookCover.replace(/"/g, '&quot;')}</div>"''',
        1,
    ),
    # Тултип аннотации: удалить и убрать сам тултип (два уровня вверх)
    (
        r'''onclick="deleteAnnotation(${currentBookId},${id});this.parentElement.parentElement.remove();"''',
        r'''data-onclick="deleteAnnotationFromTooltip(${currentBookId},${id},2)" data-args="this"''',
        1,
    ),
    # То же, но один уровень
    (
        r'''onclick="deleteAnnotation(${currentBookId},${id});this.parentElement.remove();"''',
        r'''data-onclick="deleteAnnotationFromTooltip(${currentBookId},${id},1)" data-args="this"''',
        1,
    ),
    # Тумблеры настроек
    (
        r'''onchange="setWifiOnly(this.checked);renderSettingsScreen();showToast(this.checked ? 'Только Wi-Fi' : 'Любая сеть')"''',
        r'''data-onchange="onWifiOnlyToggle()" data-args="this"''',
        1,
    ),
    (
        r'''onchange="setAutoPreload(this.checked);renderSettingsScreen();showToast(this.checked ? 'Автосохранение включено' : 'Автосохранение выключено')"''',
        r'''data-onchange="onAutoPreloadToggle()" data-args="this"''',
        1,
    ),
    # Цель по книгам: количество
    (
        r'''onclick="window._booksGoalCount=${n};document.querySelectorAll('.bg-count-btn').forEach(b=>{b.style.background='var(--bg-primary)';b.style.color='var(--text-secondary)';b.style.borderColor='var(--border)';});this.style.background='var(--accent-gradient)';this.style.color='#fff';this.style.borderColor='transparent';document.getElementById('booksGoalCount').value=${n};"''',
        r'''data-onclick="selectBooksGoalCount(${n})" data-args="this"''',
        1,
    ),
    # Цель по книгам: период
    (
        r'''onclick="window._booksGoalPeriod='${o.v}';document.querySelectorAll('.bg-period-btn').forEach(b=>{b.style.background='var(--bg-primary)';b.style.color='var(--text-secondary)';b.style.borderColor='var(--border)';});this.style.background='var(--accent-gradient)';this.style.color='#fff';this.style.borderColor='transparent';"''',
        r'''data-onclick="selectBooksGoalPeriod('${o.v}')" data-args="this"''',
        1,
    ),
    # Статус книги в списке: нужен el.value
    (
        r'''onchange="updateBookStatus(${b.id},this.value)"''',
        r'''data-onchange="onBookStatusChange(${b.id})" data-args="this"''',
        1,
    ),
    # Оглавление: обработчик есть только если у пункта известна страница.
    # Пустой onclick заменяем на отсутствие атрибута целиком.
    (
        r'''onclick="${it.page ? `tocGoTo(${it.page})` : ''}"''',
        r'''${it.page ? `data-onclick="tocGoTo(${it.page})"` : ''}''',
        1,
    ),
]

INDEX_PATCHES: list[tuple[str, str, int]] = [
    # Поиск: два обработчика на одном элементе, event нужен только keydown —
    # поэтому data-args уточнён по событию, иначе oninput получил бы лишний
    # аргумент.
    (
        r'''oninput="state.booksPage=1;renderHome()" onkeydown="if(event.key==='Enter')runFullTextSearch()"''',
        r'''data-oninput="onSearchInput()" data-onkeydown="onSearchKeydown()" data-args-keydown="event"''',
        1,
    ),
    (
        r'''onkeydown="if(event.key==='Enter')sendAIMessage()"''',
        r'''data-onkeydown="onAiInputKeydown()" data-args="event"''',
        1,
    ),
]


def run(path: Path, patches: list[tuple[str, str, int]], apply: bool) -> bool:
    if not path.exists():
        print(f"Не найден {path} — запускай из корня проекта")
        return False

    text = path.read_text(encoding="utf-8")
    ok = True
    done = 0

    for old, new, expected in patches:
        found = text.count(old)
        label = old[:70].replace("\n", " ")
        if found != expected:
            print(f"  РАСХОЖДЕНИЕ ({found} вместо {expected}): {label}...")
            ok = False
            continue
        text = text.replace(old, new)
        done += found

    if ok:
        print(f"  {path.name}: заменено {done}")
        if apply:
            shutil.copy2(path, path.with_suffix(path.suffix + ".pre-todo"))
            path.write_text(text, encoding="utf-8")

    return ok


def main() -> int:
    apply = "--apply" in sys.argv

    print("Проверка:" if not apply else "Запись:")
    ok = run(APP, APP_PATCHES, apply)
    ok = run(INDEX, INDEX_PATCHES, apply) and ok

    if not ok:
        print("\nЕсть расхождения — ничего не записано. Файл мог быть изменён"
              " после выгрузки контекста.")
        return 1

    if not apply:
        print("\nВсё сходится. Для записи: python patch_todo.py --apply")
    else:
        print("\nЗаписано. Копии до правки — рядом с .pre-todo")
    return 0


if __name__ == "__main__":
    sys.exit(main())
