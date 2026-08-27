"""unique certificate per (user_id, category)

Revision ID: uq_cert_user_cat
Revises: b8c9d0e1f2a3
"""
from alembic import op

revision = "uq_cert_user_cat"
down_revision = "b8c9d0e1f2a3"  # ← подставить вывод `alembic heads`
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Дубли могли накопиться до появления ограничения — оставляем лучший
    # результат по каждой теме, остальное удаляем. Иначе CREATE UNIQUE упадёт.
    op.execute(
        """
        DELETE FROM certificates c
        USING certificates keep
        WHERE c.user_id = keep.user_id
          AND c.category = keep.category
          AND (keep.score, keep.issued_at, keep.id) > (c.score, c.issued_at, c.id)
        """
    )
    op.create_unique_constraint(
        "uq_certificates_user_category", "certificates", ["user_id", "category"]
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_certificates_user_category", "certificates", type_="unique"
    )
