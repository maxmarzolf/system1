from __future__ import annotations

import asyncpg

from app.config import settings

pool: asyncpg.Pool | None = None


async def connect() -> asyncpg.Pool:
    global pool
    pool = await asyncpg.create_pool(settings.database_url)
    await _apply_storage_cleanup(pool)
    await _ensure_recall_history_schema(pool)
    await _ensure_practice_history_schema(pool)
    return pool


async def disconnect() -> None:
    global pool
    if pool:
        await pool.close()
        pool = None


def get_pool() -> asyncpg.Pool:
    assert pool is not None, "Database pool not initialised – call connect() first"
    return pool


async def _apply_storage_cleanup(db_pool: asyncpg.Pool) -> None:
    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                      AND table_name = 'score_attempts'
                ) THEN
                    EXECUTE $sql$
                        DELETE FROM score_attempts
                        WHERE mode <> 'main-recall'
                    $sql$;

                    EXECUTE $sql$
                        ALTER TABLE score_attempts
                        DROP CONSTRAINT IF EXISTS score_attempts_mode_check
                    $sql$;

                    EXECUTE $sql$
                        ALTER TABLE score_attempts
                        ADD CONSTRAINT score_attempts_mode_check
                        CHECK (mode IN ('main-recall'))
                    $sql$;
                END IF;
            EXCEPTION
                WHEN duplicate_object THEN NULL;
            END $$;

            DROP TABLE IF EXISTS submissions CASCADE;
            DROP TABLE IF EXISTS question_topics CASCADE;
            DROP TABLE IF EXISTS answers CASCADE;
            DROP TABLE IF EXISTS questions CASCADE;
            DROP TABLE IF EXISTS topics CASCADE;
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
            DROP COLUMN IF EXISTS options;

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

            ALTER TABLE score_attempts
            ADD COLUMN IF NOT EXISTS submission_rubric JSONB;

            ALTER TABLE score_attempts
            ADD COLUMN IF NOT EXISTS template_mode VARCHAR(20) NOT NULL DEFAULT 'algorithm';

            ALTER TABLE score_attempts
            ADD COLUMN IF NOT EXISTS support_layer VARCHAR(30) NOT NULL DEFAULT 'none';

            ALTER TABLE score_attempts
            ADD COLUMN IF NOT EXISTS hint_used BOOLEAN NOT NULL DEFAULT FALSE;

            ALTER TABLE score_attempts
            ADD COLUMN IF NOT EXISTS live_coach_used BOOLEAN NOT NULL DEFAULT FALSE;

            ALTER TABLE score_attempts
            DROP CONSTRAINT IF EXISTS score_attempts_template_mode_check;

            ALTER TABLE score_attempts
            ADD CONSTRAINT score_attempts_template_mode_check
            CHECK (template_mode IN ('pseudo', 'invariant', 'algorithm'));

            ALTER TABLE score_attempts
            DROP CONSTRAINT IF EXISTS score_attempts_support_layer_check;

            ALTER TABLE score_attempts
            ADD CONSTRAINT score_attempts_support_layer_check
            CHECK (support_layer IN ('none', 'ghost-reps'));

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
        await conn.execute(
            """
            ALTER TABLE score_attempts
            DROP COLUMN IF EXISTS drill_down_used;
            """
        )


async def _ensure_practice_history_schema(db_pool: asyncpg.Pool) -> None:
    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            ALTER TABLE score_attempts
            ADD COLUMN IF NOT EXISTS interaction_id VARCHAR(80);

            ALTER TABLE score_attempts
            ADD COLUMN IF NOT EXISTS generated_card_id VARCHAR(80);

            CREATE INDEX IF NOT EXISTS idx_score_attempts_interaction_id
                ON score_attempts(interaction_id);

            CREATE INDEX IF NOT EXISTS idx_score_attempts_generated_card_id
                ON score_attempts(generated_card_id);

            ALTER TABLE generated_skill_map_cards
            ADD COLUMN IF NOT EXISTS generation_context JSONB;

            CREATE TABLE IF NOT EXISTS coach_feedback_events (
                id SERIAL PRIMARY KEY,
                interaction_id VARCHAR(80),
                card_id VARCHAR(80) NOT NULL,
                generated_card_id VARCHAR(80),
                question_type VARCHAR(50) NOT NULL DEFAULT '',
                feedback_stage VARCHAR(20) NOT NULL CHECK (feedback_stage IN ('live', 'submission')),
                live_mode BOOLEAN NOT NULL DEFAULT FALSE,
                prompt TEXT,
                expected_answer TEXT,
                user_answer TEXT,
                accuracy REAL NOT NULL DEFAULT 0 CHECK (accuracy >= 0 AND accuracy <= 100),
                exact BOOLEAN NOT NULL DEFAULT FALSE,
                elapsed_ms INTEGER NOT NULL DEFAULT 0 CHECK (elapsed_ms >= 0),
                skill_tags TEXT[] DEFAULT '{}',
                previous_attempts JSONB,
                live_milestones JSONB,
                feedback JSONB NOT NULL DEFAULT '{}'::jsonb,
                llm_used BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            ALTER TABLE coach_feedback_events
            ADD COLUMN IF NOT EXISTS live_mode BOOLEAN NOT NULL DEFAULT FALSE;

            ALTER TABLE coach_feedback_events
            ADD COLUMN IF NOT EXISTS live_milestones JSONB;

            CREATE INDEX IF NOT EXISTS idx_coach_feedback_events_interaction
                ON coach_feedback_events(interaction_id);

            CREATE INDEX IF NOT EXISTS idx_coach_feedback_events_card
                ON coach_feedback_events(card_id);

            CREATE INDEX IF NOT EXISTS idx_coach_feedback_events_generated_card
                ON coach_feedback_events(generated_card_id);

            CREATE INDEX IF NOT EXISTS idx_coach_feedback_events_stage_created
                ON coach_feedback_events(feedback_stage, created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_coach_feedback_events_skill_tags
                ON coach_feedback_events USING GIN(skill_tags);
            """
        )
        await conn.execute(
            """
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'coach_feedback_events'
                      AND column_name = 'draft_mode'
                ) THEN
                    EXECUTE $sql$
                        UPDATE coach_feedback_events
                        SET live_mode = draft_mode
                    $sql$;
                END IF;

                IF EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'coach_feedback_events'
                      AND column_name = 'draft_milestones'
                ) THEN
                    EXECUTE $sql$
                        UPDATE coach_feedback_events
                        SET live_milestones = draft_milestones
                        WHERE live_milestones IS NULL
                    $sql$;
                END IF;
            END $$;

            ALTER TABLE coach_feedback_events
            DROP COLUMN IF EXISTS draft_mode;

            ALTER TABLE coach_feedback_events
            DROP COLUMN IF EXISTS draft_milestones;
            """
        )
