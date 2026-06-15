"""many_to_many_categories

Revision ID: d5ce34412b46
Revises: 2e8bfc7de214
Create Date: 2026-05-14 17:43:12.196109

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd5ce34412b46'
down_revision: Union[str, None] = '2e8bfc7de214'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


"""migrate book.category to many-to-many categories

Что делает эта миграция:
1. Создаёт таблицу `categories` (справочник)
2. Создаёт связующую таблицу `book_categories`
3. Копирует существующие категории из book.category в новые таблицы (по одной на книгу)
4. Удаляет старую колонку book.category

ВАЖНО: данные не теряются — каждая книга получит ровно одну категорию,
такую же как была до миграции.

Revision ID: <ВСТАВЬ_СВОЙ_HASH>
Revises: <ВСТАВЬ_ПРЕДЫДУЩИЙ_HASH>
Create Date: ...

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers — ВОЗЬМИ ИЗ АВТОГЕНЕРИРОВАННОГО ФАЙЛА, НЕ МЕНЯЙ
revision: str = 'd5ce34412b46'
down_revision: Union[str, None] = '2e8bfc7de214'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Создаём таблицу справочника категорий
    op.create_table(
        'categories',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=64), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name', name='uq_categories_name'),
    )
    op.create_index('ix_categories_name', 'categories', ['name'], unique=False)

    # 2. Создаём связующую таблицу
    op.create_table(
        'book_categories',
        sa.Column('book_id', sa.Integer(), nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['book_id'], ['books.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['category_id'], ['categories.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('book_id', 'category_id'),
    )

    # 3. Копируем уникальные существующие категории в новую таблицу
    op.execute("""
        INSERT INTO categories (name)
        SELECT DISTINCT category
        FROM books
        WHERE category IS NOT NULL AND category != ''
    """)

    # 4. Заполняем связующую таблицу: каждая книга → её категория
    op.execute("""
        INSERT INTO book_categories (book_id, category_id)
        SELECT b.id, c.id
        FROM books b
        JOIN categories c ON c.name = b.category
        WHERE b.category IS NOT NULL AND b.category != ''
    """)

    # 5. Удаляем старую колонку book.category
    # (сначала индекс, потом саму колонку)
    op.drop_index('ix_books_category', table_name='books')
    op.drop_column('books', 'category')


def downgrade() -> None:
    # Возвращаем колонку book.category (берём ПЕРВУЮ категорию книги, если их было несколько)
    op.add_column('books', sa.Column('category', sa.String(length=64), nullable=True))

    # Заполняем category первой категорией каждой книги
    op.execute("""
        UPDATE books b
        SET category = (
            SELECT c.name
            FROM categories c
            JOIN book_categories bc ON bc.category_id = c.id
            WHERE bc.book_id = b.id
            ORDER BY c.id
            LIMIT 1
        )
    """)
    # Заполняем книги без категории пустой строкой
    op.execute("UPDATE books SET category = '' WHERE category IS NULL")
    op.alter_column('books', 'category', nullable=False)
    op.create_index('ix_books_category', 'books', ['category'])

    # Удаляем новые таблицы
    op.drop_table('book_categories')
    op.drop_index('ix_categories_name', table_name='categories')
    op.drop_table('categories')