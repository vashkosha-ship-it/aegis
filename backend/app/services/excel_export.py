"""Выгрузка отчётов в Excel.

Вынесено из роутера: сборка книги Excel — самостоятельная задача в сотню
строк, не связанная с HTTP. Здесь же живёт защита от formula injection.
"""
from __future__ import annotations

import io
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

# Символы, с которых Excel и LibreOffice начинают трактовать содержимое ячейки
# как формулу. ФИО и названия книг вводят пользователи, поэтому значение
# нужно обезвредить, иначе выгрузку можно превратить в средство атаки на
# машину администратора.
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def xl_safe(value):
    """Обезвредить значение ячейки перед записью в файл."""
    if not isinstance(value, str):
        return value
    if value and value[0] in _FORMULA_PREFIXES:
        return "'" + value
    return value


def build_reading_report(rows: list[tuple], summary: dict[int, dict]) -> io.BytesIO:
    """Собрать книгу Excel с отчётом о прочитанном.

    rows — записи (пользователь, книга, дата завершения);
    summary — агрегат «сколько книг прочёл каждый».

    Возвращает готовый буфер, установленный на начало.
    """
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill

    wb = Workbook()
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="2F2B7B")

    def _write_header(sheet, names: list[str]) -> None:
        for col, name in enumerate(names, start=1):
            cell = sheet.cell(row=1, column=col, value=name)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center")

    # Лист 1: сводка по пользователям
    ws1 = wb.active
    ws1.title = "Сводка"
    _write_header(ws1, ["ФИО", "Подразделение", "Прочитано книг"])
    for i, s in enumerate(sorted(summary.values(), key=lambda x: -x["count"]), start=2):
        ws1.cell(row=i, column=1, value=xl_safe(s["fio"]))
        ws1.cell(row=i, column=2, value=xl_safe(s["dept"]))
        ws1.cell(row=i, column=3, value=s["count"])
    ws1.column_dimensions["A"].width = 30
    ws1.column_dimensions["B"].width = 22
    ws1.column_dimensions["C"].width = 16

    # Лист 2: детализация (каждая прочитанная книга)
    ws2 = wb.create_sheet("Детализация")
    _write_header(ws2, ["ФИО", "Подразделение", "Книга", "Дата завершения"])
    for i, (user, book, when) in enumerate(rows, start=2):
        ws2.cell(row=i, column=1, value=xl_safe(user.full_name or user.username))
        ws2.cell(row=i, column=2, value=xl_safe(user.department or "—"))
        ws2.cell(row=i, column=3, value=xl_safe(book.title))
        ws2.cell(row=i, column=4, value=when.strftime("%Y-%m-%d %H:%M") if when else "")
    ws2.column_dimensions["A"].width = 30
    ws2.column_dimensions["B"].width = 22
    ws2.column_dimensions["C"].width = 45
    ws2.column_dimensions["D"].width = 18

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def report_filename(date_from: str | None, date_to: str | None) -> str:
    """Имя файла выгрузки с периодом, если он задан."""
    period = ""
    if date_from or date_to:
        period = f"_{date_from or 'нач'}_{date_to or 'кон'}"
    return f"aegis_reading{period}.xlsx"


def parse_period(
    date_from: str | None, date_to: str | None
) -> tuple[datetime | None, datetime | None]:
    """Разобрать границы периода из ISO-строк. ValueError при плохом формате."""
    from datetime import UTC, timedelta

    df = dt = None
    if date_from:
        df = datetime.fromisoformat(date_from).replace(tzinfo=UTC)
    if date_to:
        # Верхняя граница исключающая: дата 2026-01-31 включает весь этот день.
        dt = datetime.fromisoformat(date_to).replace(tzinfo=UTC) + timedelta(days=1)
    return df, dt


def build_users_report(users: list) -> io.BytesIO:
    """Собрать книгу Excel со списком пользователей.

    Пароли не выгружаются: в базе хранится только их bcrypt-хеш, исходный
    пароль восстановить нельзя.
    """
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill

    wb = Workbook()
    ws = wb.active
    ws.title = "Пользователи"
    headers = [
        "ФИО", "Логин", "Почта", "Подразделение", "Роль",
        "Статус", "Почта подтверждена", "Дата регистрации",
    ]
    for col, name in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col, value=name)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="2F2B7B")
        cell.alignment = Alignment(horizontal="center")

    for i, u in enumerate(users, start=2):
        role = getattr(u.role, "value", u.role)
        ws.cell(row=i, column=1, value=xl_safe(u.full_name or ""))
        ws.cell(row=i, column=2, value=xl_safe(u.username))
        ws.cell(row=i, column=3, value=xl_safe(u.email or ""))
        ws.cell(row=i, column=4, value=xl_safe(u.department or ""))
        ws.cell(row=i, column=5, value="Администратор" if role == "admin" else "Читатель")
        ws.cell(row=i, column=6, value="Активен" if u.is_active else "Не активен")
        ws.cell(row=i, column=7, value="Да" if u.is_verified else "Нет")
        ws.cell(
            row=i, column=8,
            value=u.created_at.strftime("%Y-%m-%d %H:%M") if u.created_at else "",
        )
    for col, width in zip("ABCDEFGH", (32, 20, 30, 22, 16, 12, 18, 18), strict=True):
        ws.column_dimensions[col].width = width
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf
