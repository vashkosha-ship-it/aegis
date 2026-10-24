"""backfill «Читаю» for books with reading progress but no list status

Revision ID: backfill_reading_status
Revises: book_file_sha256

До исправления статус «Читаю» ставился при открытии книги только в памяти
вкладки. У книг, начатых тогда, есть прогресс, но нет записи в «Моём
списке»: на главной они в «Продолжить», а в «Мой список → Читаю» их нет.
Дочитанные (finished_at) не трогаем — им статус «Читаю» не подходит.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "backfill_reading_status"
down_revision: str | None = "book_file_sha256"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


BACKFILL_SQL = """
        INSERT INTO mylist_entries (user_id, book_id, status, updated_at)
        SELECT rp.user_id, rp.book_id, 'READING', now()
        FROM reading_progress rp
        WHERE rp.started IS TRUE
          AND rp.finished_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM mylist_entries me
            WHERE me.user_id = rp.user_id AND me.book_id = rp.book_id
          )
"""


def upgrade() -> None:
    op.execute(BACKFILL_SQL)


def downgrade() -> None:
    # Данные назад не откатываем: отличить проставленные миграцией статусы
    # от выбранных пользователем после неё уже нельзя.
    pass
