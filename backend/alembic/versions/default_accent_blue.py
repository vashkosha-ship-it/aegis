"""default accent: blue

Revision ID: default_accent_blue
Revises: legal_consent_settings

Цвет оформления по умолчанию сменился с оранжевого на синий. Оранжевый в
профиле почти всегда был не выбором, а прежним значением по умолчанию: его
записывал счётчик использования при каждом входе. Сбрасываем его, чтобы
такие пользователи получили новый цвет по умолчанию. Остальные цвета —
осознанный выбор, их не трогаем. Схема не меняется.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "default_accent_blue"
down_revision: str | None = "legal_consent_settings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("UPDATE users SET ui_accent = NULL WHERE ui_accent = 'orange'")


def downgrade() -> None:
    # Какие из сброшенных значений были выбором, а какие — умолчанием,
    # неизвестно; возвращать всем оранжевый было бы неверно.
    pass
