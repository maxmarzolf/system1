"""Alembic environment: async (asyncpg) engine, raw-SQL revisions, no metadata."""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

from app.migrations.runner import MIGRATION_LOCK_KEY, async_database_url

config = context.config

# Only the CLI configures logging from alembic.ini; inside the app it would
# replace the server's logging setup.
if config.config_file_name is not None:  # pragma: no cover - CLI only
    fileConfig(config.config_file_name, disable_existing_loggers=False)


def _database_url() -> str:  # pragma: no cover - CLI only
    url = config.get_main_option("sqlalchemy.url")
    if not url:
        from app.config import settings

        url = settings.database_url
    return async_database_url(url)


def _run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=None)
    with context.begin_transaction():
        connection.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": MIGRATION_LOCK_KEY})
        context.run_migrations()


async def _run_migrations_online() -> None:  # pragma: no cover - CLI only
    engine = create_async_engine(_database_url(), poolclass=pool.NullPool)
    try:
        async with engine.connect() as connection:
            await connection.run_sync(_run_migrations)
            await connection.commit()
    finally:
        await engine.dispose()


if context.is_offline_mode():  # pragma: no cover - `alembic upgrade --sql` only
    context.configure(url=_database_url(), target_metadata=None, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
elif (connection := config.attributes.get("connection")) is not None:
    # Programmatic upgrade (app startup, tests): reuse the caller's connection.
    _run_migrations(connection)
else:  # pragma: no cover - `alembic upgrade head` from the CLI
    asyncio.run(_run_migrations_online())
