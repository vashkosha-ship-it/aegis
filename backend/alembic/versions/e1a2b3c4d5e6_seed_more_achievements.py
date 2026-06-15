"""seed_more_achievements

Data-only миграция: добавляет каталог достижений с triggers.
Безопасна к повторному прогону (upsert по code).

Revision ID: e1a2b3c4d5e6
Revises: d429015be5a0
Create Date: 2026-06-02
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e1a2b3c4d5e6"
down_revision: Union[str, None] = "d429015be5a0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (code, name, description, tier)
NEW_ACHIEVEMENTS = [
    # Базовые (на случай если ранние миграции не засеяли — upsert безопасен)
    ("ach_reading_1",  "Первые шаги",         "Начал читать первую книгу",            "bronze"),
    ("ach_finish_1",   "Первая книга",        "Дочитал первую книгу до конца",        "bronze"),
    ("ach_quiz_1",     "Первый тест",         "Прошёл первый тест",                   "bronze"),
    ("ach_note_1",     "Заметка на полях",    "Создал первую заметку или выделение",  "bronze"),
    ("ach_level_test", "Самооценка",          "Прошёл тест уровня кибербезопасности", "bronze"),
    ("review_1",       "Первый отзыв",        "Оставил первый отзыв",                 "bronze"),

    # Чтение (старт книг)
    ("books_5",        "Книголюб",            "Начал читать 5 книг",                  "silver"),
    ("books_10",       "Библиофил",           "Начал читать 10 книг",                 "gold"),
    ("books_25",       "Книжный червь",       "Начал читать 25 книг",                 "platinum"),

    # Чтение (завершённые)
    ("finish_5",       "Марафонец",           "Дочитал 5 книг",                       "gold"),
    ("finish_10",      "Покоритель полок",    "Дочитал 10 книг",                      "gold"),
    ("finish_25",      "Легенда библиотеки",  "Дочитал 25 книг",                      "platinum"),

    # Тесты
    ("quiz_5",         "Знаток",              "Прошёл 5 тестов с результатом 60+",    "silver"),
    ("quiz_10",        "Эксперт тестов",      "Прошёл 10 тестов с результатом 60+",   "gold"),
    ("quiz_25",        "Гуру тестов",         "Прошёл 25 тестов с результатом 60+",   "platinum"),
    ("quiz_perfect",   "Идеальный результат", "Прошёл тест на 100",                   "gold"),
    ("quiz_perfect_5", "Безупречный",         "5 тестов на 100",                      "platinum"),

    # Отзывы
    ("review_5",       "Критик",              "Оставил 5 отзывов",                    "silver"),
    ("review_10",      "Рецензент",           "Оставил 10 отзывов",                   "gold"),

    # XP
    ("xp_500",         "Новобранец",          "Набрал 500 XP",                        "bronze"),
    ("xp_1000",        "Тысячник",            "Набрал 1000 XP",                       "silver"),
    ("xp_2500",        "Боец",                "Набрал 2500 XP",                       "silver"),
    ("xp_5000",        "Ветеран",             "Набрал 5000 XP",                       "gold"),
    ("xp_10000",       "Магистр",             "Набрал 10000 XP",                      "platinum"),

    # Стрик
    ("streak_3",       "Втягиваюсь",          "Серия чтения 3 дня подряд",            "bronze"),
    ("streak_7",       "Неделя силы",         "Серия чтения 7 дней подряд",           "silver"),
    ("streak_14",      "Две недели подряд",   "Серия чтения 14 дней подряд",          "silver"),
    ("streak_30",      "Железная дисциплина", "Серия чтения 30 дней подряд",          "gold"),
    ("streak_100",     "Сотня дней",          "Серия чтения 100 дней подряд",         "platinum"),
]


def upgrade() -> None:
    bind = op.get_bind()
    for code, name, description, tier in NEW_ACHIEVEMENTS:
        bind.execute(
            sa.text(
                """
                INSERT INTO achievements (code, name, description, icon, tier)
                VALUES (:code, :name, :description, :icon, :tier)
                ON CONFLICT (code) DO NOTHING
                """
            ),
            {
                "code": code,
                "name": name,
                "description": description,
                "icon": "trophy",  # placeholder — фронт сам отрендерит SVG по коду
                "tier": tier,
            },
        )


def downgrade() -> None:
    bind = op.get_bind()
    codes = [a[0] for a in NEW_ACHIEVEMENTS]
    bind.execute(
        sa.text("DELETE FROM achievements WHERE code IN :codes").bindparams(
            sa.bindparam("codes", expanding=True)
        ),
        {"codes": codes},
    )