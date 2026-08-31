"""add pages_advanced and reading_seconds to reading_progress

Revision ID: reading_counters
Revises: uq_cert_user_cat
"""
import sqlalchemy as sa
from alembic import op

revision = "reading_counters"
down_revision = "uq_cert_user_cat"  # ← подставит tools/set_down_revision.ps1
branch_labels = None
depends_on = None


def upgrade() -> None:
    # server_default="0" обязателен: строки уже есть, а колонки NOT NULL.
    op.add_column(
        "reading_progress",
        sa.Column("pages_advanced", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "reading_progress",
        sa.Column("reading_seconds", sa.Integer(), nullable=False, server_default="0"),
    )

    # Уже дочитанным книгам проставляем счётчики задним числом. Иначе после
    # выката они выглядели бы как «дочитаны, но продвижения нет», и повторное
    # открытие последней страницы писало бы в лог отказ засчитать завершение.
    # На сами достижения это не влияет: finished_at уже проставлен.
    op.execute(
        """
        UPDATE reading_progress
        SET pages_advanced = total_pages
        WHERE finished_at IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_column("reading_progress", "reading_seconds")
    op.drop_column("reading_progress", "pages_advanced")
