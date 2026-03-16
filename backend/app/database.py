from __future__ import annotations

import asyncpg

from app.config import settings

pool: asyncpg.Pool | None = None


async def connect() -> asyncpg.Pool:
    global pool
    pool = await asyncpg.create_pool(settings.database_url)
    await _apply_mode_migration(pool)
    await _ensure_system1_session_table(pool)
    return pool


async def disconnect() -> None:
    global pool
    if pool:
        await pool.close()
        pool = None


def get_pool() -> asyncpg.Pool:
    assert pool is not None, "Database pool not initialised – call connect() first"
    return pool


async def _apply_mode_migration(db_pool: asyncpg.Pool) -> None:
    allowed_modes = (
        "'main-recall', 'snap-classify', 'template-hunt', 'gut-check', 'no-go-trap', 'near-miss-duel', "
        "'multiple-choice', 'full-solution', 'typing-race'"
    )

    async with db_pool.acquire() as conn:
        await conn.execute(
            f"""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                      AND table_name = 'score_attempts'
                ) THEN
                    ALTER TABLE score_attempts
                    DROP CONSTRAINT IF EXISTS score_attempts_mode_check;

                    ALTER TABLE score_attempts
                    ADD CONSTRAINT score_attempts_mode_check
                    CHECK (mode IN ({allowed_modes}));
                END IF;
            EXCEPTION
                WHEN duplicate_object THEN NULL;
            END $$;
            """
        )


async def _ensure_system1_session_table(db_pool: asyncpg.Pool) -> None:
    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS system1_sessions (
                id SERIAL PRIMARY KEY,
                mode VARCHAR(50) NOT NULL,
                question_type VARCHAR(50) NOT NULL DEFAULT '',
                order_type VARCHAR(20) NOT NULL CHECK (order_type IN ('shuffled', 'original')),
                card_count INTEGER NOT NULL DEFAULT 0 CHECK (card_count >= 0),
                attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
                correct_count INTEGER NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
                accuracy REAL NOT NULL DEFAULT 0 CHECK (accuracy >= 0 AND accuracy <= 100),
                duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
                total_score INTEGER NOT NULL DEFAULT 0,
                avg_automaticity REAL NOT NULL DEFAULT 0 CHECK (avg_automaticity >= 0 AND avg_automaticity <= 100),
                started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_system1_sessions_completed
                ON system1_sessions(completed_at DESC);

            CREATE INDEX IF NOT EXISTS idx_system1_sessions_mode
                ON system1_sessions(mode);
            """
        )
