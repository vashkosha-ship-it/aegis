"""Выдать «Самооценку» и «Заметку на полях» тем, кто их заслужил раньше

Условия этих достижений были описаны, но тест уровня и создание заметки
не вызывали проверку — достижения не получал никто. Код исправлен; здесь
выдаём их задним числом: за определённый уровень и за любую заметку или
выделение. Дата — когда это произошло.

Revision ID: award_missed_achievements
Revises: book_file_warning
"""

from collections.abc import Sequence

from alembic import op

revision: str = "award_missed_achievements"
down_revision: str | None = "book_file_warning"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO user_achievements (user_id, achievement_id, awarded_at)
        SELECT u.id, a.id, COALESCE(u.level_assessed_at, now())
        FROM users u
        JOIN achievements a ON a.code = 'ach_level_test'
        WHERE u.cyber_level IS NOT NULL OR u.level_assessed_at IS NOT NULL
        ON CONFLICT (user_id, achievement_id) DO NOTHING
    """)
    op.execute("""
        INSERT INTO user_achievements (user_id, achievement_id, awarded_at)
        SELECT n.user_id, a.id, n.first_at
        FROM (
            SELECT user_id, MIN(created_at) AS first_at
            FROM annotations
            GROUP BY user_id
        ) n
        JOIN achievements a ON a.code = 'ach_note_1'
        ON CONFLICT (user_id, achievement_id) DO NOTHING
    """)


def downgrade() -> None:
    # Выданные достижения не отзываем.
    pass
