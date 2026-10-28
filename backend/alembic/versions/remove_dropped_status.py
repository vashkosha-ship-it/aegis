"""remove «Брошено» mylist status

Revision ID: remove_dropped_status
Revises: org_units

Статус «Брошено» убран из интерфейса. Книги с этим статусом уходят из
«Моего списка» (как «Не в списке»); прогресс чтения у них сохраняется.
Значение enum в базе остаётся — удалять значения из enum PostgreSQL нельзя
без пересоздания типа, а вреда от неиспользуемого значения нет.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "remove_dropped_status"
down_revision: str | None = "org_units"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("DELETE FROM mylist_entries WHERE status = 'DROPPED'")


def downgrade() -> None:
    # Удалённые записи не восстановить; возвращать нечего.
    pass
