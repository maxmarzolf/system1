from __future__ import annotations

import asyncpg

from app.config import settings

pool: asyncpg.Pool | None = None


async def connect() -> asyncpg.Pool:
    global pool
    pool = await asyncpg.create_pool(settings.database_url)
    await _apply_mode_migration(pool)
    await _ensure_recall_history_schema(pool)
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


async def _ensure_recall_history_schema(db_pool: asyncpg.Pool) -> None:
    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            ALTER TABLE score_attempts
            ADD COLUMN IF NOT EXISTS question_type VARCHAR(50) NOT NULL DEFAULT '';

            ALTER TABLE score_attempts
            ADD COLUMN IF NOT EXISTS category_tags TEXT[] DEFAULT '{}';

            ALTER TABLE score_attempts
            ADD COLUMN IF NOT EXISTS accuracy REAL NOT NULL DEFAULT 0 CHECK (accuracy >= 0 AND accuracy <= 100);

            ALTER TABLE score_attempts
            ADD COLUMN IF NOT EXISTS exact BOOLEAN NOT NULL DEFAULT FALSE;

            ALTER TABLE score_attempts
            ADD COLUMN IF NOT EXISTS elapsed_ms INTEGER NOT NULL DEFAULT 0 CHECK (elapsed_ms >= 0);

            ALTER TABLE score_attempts
            ADD COLUMN IF NOT EXISTS generated_card JSONB;

            ALTER TABLE score_attempts
            ADD COLUMN IF NOT EXISTS coach_feedback JSONB;

            CREATE INDEX IF NOT EXISTS idx_score_attempts_question_type
                ON score_attempts(question_type);

            CREATE INDEX IF NOT EXISTS idx_score_attempts_category_tags
                ON score_attempts USING GIN(category_tags);

            CREATE TABLE IF NOT EXISTS generated_skill_map_cards (
                id VARCHAR(80) PRIMARY KEY,
                question_type VARCHAR(50) NOT NULL DEFAULT 'skill-map',
                title VARCHAR(255) NOT NULL,
                difficulty VARCHAR(20) NOT NULL CHECK (difficulty IN ('Easy', 'Med.', 'Hard')),
                prompt TEXT NOT NULL,
                solution TEXT NOT NULL,
                missing TEXT NOT NULL,
                hint TEXT NOT NULL DEFAULT '',
                tags TEXT[] DEFAULT '{}',
                llm_used BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_generated_skill_map_cards_created
                ON generated_skill_map_cards(created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_generated_skill_map_cards_tags
                ON generated_skill_map_cards USING GIN(tags);
            """
        )
