"""remove «Избранное» mylist status

Revision ID: remove_liked_status
Revises: remove_dropped_status

В «Моём списке» остаются три вкладки: «Читаю», «В планах», «Прочитано».
Книги из «Избранного» не теряются: если книгу когда-то дочитали, она
становится «Прочитано», иначе — «В планах».
"""

from collections.abc import Sequence

from alembic import op

revision: str = "remove_liked_status"
down_revision: str | None = "remove_dropped_status"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "UPDATE mylist_entries SET status = 'COMPLETED' "
        "WHERE status = 'LIKED' AND completed_at IS NOT NULL"
    )
    op.execute("UPDATE mylist_entries SET status = 'PLANNED' WHERE status = 'LIKED'")


def downgrade() -> None:
    # Какие книги были в «Избранном», уже не узнать; возвращать нечего.
    pass
