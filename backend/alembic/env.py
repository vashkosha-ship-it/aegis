"""Alembic environment — uses sync URL because Alembic itself isn't async-friendly.
We declare an async URL for the app (asyncpg) and a parallel sync URL (psycopg2) for migrations.
"""
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context

# Import all models so metadata is populated
from app.core.config import settings
from app.db.session import Base
import app.models  # noqa: F401  — populates Base.metadata

config = context.config

if config.config_file_name:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", settings.DATABASE_URL_SYNC)

target_metadata = Base.metadata

# Колонки полнотекстового поиска: tsvector, вычисляемые самой базой
# (GENERATED ALWAYS AS ... STORED), и GIN-индексы по ним. Их создаёт отдельная
# миграция сырым SQL, потому что SQLAlchemy не описывает такие выражения
# полностью. Alembic не умеет сравнивать Computed-колонки с реальной схемой и
# при каждой проверке предлагает их удалить — согласиться значит сломать поиск.
# Поэтому исключаем их из автосравнения; сами объекты живут в миграциях.
_SEARCH_OBJECTS = {
    ("column", "books", "search_vector"),
    ("column", "book_pages", "search_vector"),
    ("index", "books", "ix_books_search"),
    ("index", "book_pages", "ix_book_pages_search"),
}


def include_object(obj, name, type_, reflected, compare_to):
    """Решает, участвует ли объект в автогенерации и alembic check."""
    table_name = getattr(getattr(obj, "table", None), "name", None)
    if (type_, table_name, name) in _SEARCH_OBJECTS:
        return False
    return True


def run_migrations_offline() -> None:
    """Generate SQL without connecting to the database."""
    context.configure(
        url=settings.DATABASE_URL_SYNC,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against a live database."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            include_object=include_object,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
