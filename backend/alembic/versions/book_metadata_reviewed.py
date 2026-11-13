"""books.metadata_reviewed_at — прерванная проверка «Названия и теги» продолжается

Перезапуск воркера (каждая выкладка) прерывал проверку карточек, и задача
навсегда оставалась «в работе». Теперь у каждой проверенной книги есть
отметка времени, и новая проверка пропускает уже проверенные.

Для проверки, прерванной до этой миграции, отметок ещё нет. Книги в ней
шли по возрастанию id (параллельно по 4), поэтому первые processed_books
книг по id считаем проверенными — с запасом на параллельность.

Revision ID: book_metadata_reviewed
Revises: book_file_problem
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "book_metadata_reviewed"
down_revision: str | None = "book_file_problem"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Запас: столько книг перед границей проверим ещё раз (это безопасно).
SAFETY_MARGIN = 16


def upgrade() -> None:
    op.add_column("books", sa.Column("metadata_reviewed_at", sa.DateTime(timezone=True), nullable=True))

    conn = op.get_bind()
    job = conn.execute(sa.text(
        "SELECT id, processed_books, total_books, started_at FROM book_metadata_jobs "
        "WHERE status IN ('running', 'failed') AND started_at IS NOT NULL "
        "ORDER BY created_at DESC LIMIT 1"
    )).first()
    if job is None:
        return
    latest = conn.execute(sa.text(
        "SELECT id FROM book_metadata_jobs ORDER BY created_at DESC LIMIT 1"
    )).scalar()
    if latest != job.id or job.processed_books >= job.total_books:
        return
    done = max(job.processed_books - SAFETY_MARGIN, 0)
    if done:
        conn.execute(sa.text(
            "UPDATE books SET metadata_reviewed_at = :at WHERE id IN ("
            "  SELECT id FROM books WHERE created_at <= :at ORDER BY id LIMIT :done"
            ")"
        ), {"at": job.started_at, "done": done})
    conn.execute(sa.text(
        "UPDATE book_metadata_jobs SET status = 'failed', finished_at = now(), "
        "last_error = 'Проверка прервана перезапуском воркера' "
        "WHERE id = :id AND status = 'running'"
    ), {"id": job.id})


def downgrade() -> None:
    op.drop_column("books", "metadata_reviewed_at")
