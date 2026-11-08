"""Run Alembic migrations from application code and from the ``alembic`` CLI.

Migrations are raw SQL. SQLAlchemy is only the connection layer Alembic needs;
it runs on the asyncpg driver the app already uses (``postgresql+asyncpg``).
"""

from __future__ import annotations

from pathlib import Path

from alembic import command, context, op
from alembic.config import Config
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.util import await_only

MIGRATIONS_DIR = Path(__file__).parent

# Postgres advisory lock held (per transaction) while migrations run, so two
# processes upgrading at once apply each revision exactly once.
MIGRATION_LOCK_KEY = 0x5157_4D49  # "SYMI"


def async_database_url(url: str) -> str:
    """``postgresql://...`` -> ``postgresql+asyncpg://...`` (other schemes unchanged)."""
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+asyncpg://" + url[len(prefix):]
    return url


def alembic_config(database_url: str) -> Config:
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS_DIR))
    # ConfigParser interpolates '%', which can appear in URL-encoded passwords.
    config.set_main_option("sqlalchemy.url", async_database_url(database_url).replace("%", "%%"))
    return config


async def upgrade_to_head(database_url: str) -> None:
    """``alembic upgrade head`` on a single connection, committed at the end."""
    config = alembic_config(database_url)
    engine = create_async_engine(config.get_main_option("sqlalchemy.url"), poolclass=pool.NullPool)
    try:
        async with engine.connect() as connection:
            await connection.run_sync(_upgrade, config)
            await connection.commit()
    finally:
        await engine.dispose()


def _upgrade(connection: Connection, config: Config) -> None:
    config.attributes["connection"] = connection
    command.upgrade(config, "head")


def execute_script(sql: str) -> None:
    """Run one or more SQL statements (``DO $$`` blocks included) inside a migration.

    SQLAlchemy prepares every statement, and Postgres refuses to prepare more
    than one command, so scripts go straight to asyncpg's simple-query protocol
    on the migration connection (same session, same transaction).
    """
    if context.is_offline_mode():
        op.execute(sql)
        return
    driver_connection = op.get_bind().connection.driver_connection
    await_only(driver_connection.execute(sql))


def read_sql(revision_file: str) -> str:
    """The ``.sql`` file that sits next to a revision module."""
    return Path(revision_file).with_suffix(".sql").read_text(encoding="utf-8")
