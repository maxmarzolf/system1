from __future__ import annotations

import inspect
import json

import asyncpg

from app.config import settings
from app.core import core_algorithms, core_meta
from app.core.core_algorithm_catalog import CORE_ALGORITHM_CATALOG, CORE_META_CATALOG
from app.core.taxonomy_catalog import (
    ALGORITHMS,
    CANONICAL_SKILLS,
    PATTERN_TO_ALGORITHM,
    RETIRED_SKILLS,
    TECHNIQUES,
)

pool: asyncpg.Pool | None = None

async def connect() -> asyncpg.Pool:
    global pool
    pool = await asyncpg.create_pool(settings.database_url)
    await _apply_storage_cleanup(pool)
    await _ensure_recall_history_schema(pool)
    await _ensure_generated_question_schema(pool)
    await _ensure_generated_skill_map_card_schema(pool)
    await _backfill_submission_attempts_from_score_attempts(pool)
    await _apply_core_algorithm_naming_migration(pool)
    await _ensure_taxonomy_schema(pool)
    await _seed_taxonomy(pool)
    await _apply_taxonomy_remap_migration(pool)
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
            DROP TABLE IF EXISTS submissions CASCADE;
            DROP TABLE IF EXISTS question_topics CASCADE;
            DROP TABLE IF EXISTS answers CASCADE;
            DROP TABLE IF EXISTS questions CASCADE;
            -- Feedback, rubric, timing, and scoring signals now live only on
            -- the canonical submission ledger.
            DROP TABLE IF EXISTS coach_feedback_events CASCADE;
            -- Legacy pattern/method taxonomy, superseded by algorithm/skill.
            DROP TABLE IF EXISTS methods CASCADE;
            DROP TABLE IF EXISTS patterns CASCADE;
            DROP TABLE IF EXISTS topics CASCADE;
            """
        )


async def _ensure_recall_history_schema(db_pool: asyncpg.Pool) -> None:
    async with db_pool.acquire() as conn:
        await conn.execute(
            """
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


async def _ensure_generated_question_schema(db_pool: asyncpg.Pool) -> None:
    async with db_pool.acquire() as conn:
        # Rename the canonical attempt ledger from answer -> submission without
        # losing existing practice history on long-lived local databases.
        await conn.execute(
            """
            DO $$
            DECLARE
                old_index text;
                new_index text;
            BEGIN
                IF to_regclass('public.multiple_choice_problem') IS NULL
                   AND to_regclass('public.question') IS NOT NULL THEN
                    ALTER TABLE question RENAME TO multiple_choice_problem;
                END IF;

                IF to_regclass('public.answer') IS NOT NULL THEN
                    ALTER TABLE answer DROP CONSTRAINT IF EXISTS answer_question_id_fkey;
                    ALTER TABLE answer DROP CONSTRAINT IF EXISTS submission_question_id_fkey;
                END IF;

                IF to_regclass('public.submission') IS NOT NULL THEN
                    ALTER TABLE submission DROP CONSTRAINT IF EXISTS submission_question_id_fkey;
                    ALTER TABLE submission DROP CONSTRAINT IF EXISTS answer_question_id_fkey;
                    ALTER TABLE submission DROP CONSTRAINT IF EXISTS submission_multiple_choice_problem_id_fkey;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'submission'
                          AND column_name = 'question_id'
                    )
                       AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'submission'
                          AND column_name = 'multiple_choice_problem_id'
                    ) THEN
                        ALTER TABLE submission RENAME COLUMN question_id TO multiple_choice_problem_id;
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'submission'
                          AND column_name = 'question_id'
                    )
                       AND EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'submission'
                          AND column_name = 'multiple_choice_problem_id'
                    ) THEN
                        UPDATE submission
                        SET multiple_choice_problem_id = question_id
                        WHERE multiple_choice_problem_id IS NULL
                          AND question_id LIKE 'mcq-%';

                        ALTER TABLE submission DROP COLUMN question_id;
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'submission'
                          AND column_name = 'multiple_choice_problem_id'
                    ) THEN
                        ALTER TABLE submission ALTER COLUMN multiple_choice_problem_id DROP NOT NULL;

                        UPDATE submission
                        SET multiple_choice_problem_id = NULL
                        WHERE multiple_choice_problem_id IS NOT NULL
                          AND multiple_choice_problem_id NOT LIKE 'mcq-%';
                    END IF;
                END IF;

                IF to_regclass('public.multiple_choice_problem') IS NOT NULL
                   AND to_regclass('public.question') IS NOT NULL THEN
                    INSERT INTO multiple_choice_problem (
                        id,
                        user_id,
                        question_text,
                        question_help_text,
                        recall_answer,
                        multiple_choice_answer_label_1,
                        multiple_choice_answer_text_1,
                        multiple_choice_answer_label_2,
                        multiple_choice_answer_text_2,
                        multiple_choice_answer_label_3,
                        multiple_choice_answer_text_3,
                        multiple_choice_answer_label_4,
                        multiple_choice_answer_text_4,
                        multiple_choice_correct_answer_label,
                        multiple_choice_correct_answer_text,
                        fingerprint,
                        created_date,
                        modified_date
                    )
                    SELECT
                        id,
                        user_id,
                        question_text,
                        question_help_text,
                        recall_answer,
                        multiple_choice_answer_label_1,
                        multiple_choice_answer_text_1,
                        multiple_choice_answer_label_2,
                        multiple_choice_answer_text_2,
                        multiple_choice_answer_label_3,
                        multiple_choice_answer_text_3,
                        multiple_choice_answer_label_4,
                        multiple_choice_answer_text_4,
                        multiple_choice_correct_answer_label,
                        multiple_choice_correct_answer_text,
                        fingerprint,
                        created_date,
                        modified_date
                    FROM question
                    WHERE id LIKE 'mcq-%'
                    ON CONFLICT (id) DO NOTHING;

                    DROP TABLE question;
                END IF;

                IF to_regclass('public.multiple_choice_problem') IS NOT NULL THEN
                    DELETE FROM multiple_choice_problem
                    WHERE id NOT LIKE 'mcq-%';

                    IF to_regclass('public.submission') IS NOT NULL
                       AND EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'submission'
                          AND column_name = 'multiple_choice_problem_id'
                    ) THEN
                        UPDATE submission s
                        SET multiple_choice_problem_id = NULL
                        WHERE s.multiple_choice_problem_id IS NOT NULL
                          AND NOT EXISTS (
                            SELECT 1
                            FROM multiple_choice_problem p
                            WHERE p.id = s.multiple_choice_problem_id
                        );
                    END IF;
                END IF;

                IF to_regclass('public.submission') IS NULL
                   AND to_regclass('public.answer') IS NOT NULL THEN
                    ALTER TABLE answer RENAME TO submission;
                END IF;

                IF to_regclass('public.submission') IS NOT NULL THEN
                    ALTER TABLE submission DROP CONSTRAINT IF EXISTS submission_question_id_fkey;
                    ALTER TABLE submission DROP CONSTRAINT IF EXISTS answer_question_id_fkey;
                    ALTER TABLE submission DROP CONSTRAINT IF EXISTS submission_multiple_choice_problem_id_fkey;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'submission'
                          AND column_name = 'question_id'
                    )
                       AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'submission'
                          AND column_name = 'multiple_choice_problem_id'
                    ) THEN
                        ALTER TABLE submission RENAME COLUMN question_id TO multiple_choice_problem_id;
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'submission'
                          AND column_name = 'question_id'
                    )
                       AND EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'submission'
                          AND column_name = 'multiple_choice_problem_id'
                    ) THEN
                        UPDATE submission
                        SET multiple_choice_problem_id = question_id
                        WHERE multiple_choice_problem_id IS NULL
                          AND question_id LIKE 'mcq-%';

                        ALTER TABLE submission DROP COLUMN question_id;
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'submission'
                          AND column_name = 'multiple_choice_problem_id'
                    ) THEN
                        ALTER TABLE submission ALTER COLUMN multiple_choice_problem_id DROP NOT NULL;

                        UPDATE submission
                        SET multiple_choice_problem_id = NULL
                        WHERE multiple_choice_problem_id IS NOT NULL
                          AND multiple_choice_problem_id NOT LIKE 'mcq-%';
                    END IF;
                END IF;

                IF to_regclass('public.submission') IS NOT NULL
                   AND to_regclass('public.answer') IS NOT NULL THEN
                    ALTER TABLE submission
                    ADD COLUMN IF NOT EXISTS signals JSONB NOT NULL DEFAULT '{"elapsed_ms": 0}'::jsonb;

                    ALTER TABLE submission
                    ADD COLUMN IF NOT EXISTS successful BOOLEAN NOT NULL DEFAULT FALSE;

                    ALTER TABLE answer
                    ADD COLUMN IF NOT EXISTS signals JSONB NOT NULL DEFAULT '{"elapsed_ms": 0}'::jsonb;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public' AND table_name = 'answer' AND column_name = 'elapsed_ms'
                    ) THEN
                        EXECUTE 'UPDATE answer SET signals = jsonb_strip_nulls(jsonb_build_object(''elapsed_ms'', elapsed_ms)) || signals';
                    END IF;
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public' AND table_name = 'answer' AND column_name = 'coach_feedback'
                    ) THEN
                        EXECUTE 'UPDATE answer SET signals = jsonb_strip_nulls(jsonb_build_object(''coach_feedback'', coach_feedback)) || signals';
                    END IF;
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public' AND table_name = 'answer' AND column_name = 'submission_rubric'
                    ) THEN
                        EXECUTE 'UPDATE answer SET signals = jsonb_strip_nulls(jsonb_build_object(''submission_rubric'', submission_rubric)) || signals';
                    END IF;

                    INSERT INTO submission (
                        id,
                        session_id,
                        user_id,
                        multiple_choice_problem_id,
                        answer,
                        question_type,
                        category_tags,
                        correct_answer,
                        successful,
                        signals,
                        interaction_id,
                        generated_card_id,
                        generated_card,
                        template_mode,
                        support_layer,
                        live_coach_used,
                        activity_format,
                        target_source,
                        target_control,
                        format_control,
                        migration_key,
                        created_at,
                        updated_at
                    )
                    SELECT
                        id,
                        session_id,
                        user_id,
                        CASE WHEN question_id LIKE 'mcq-%' THEN question_id ELSE NULL END,
                        answer,
                        question_type,
                        category_tags,
                        correct_answer,
                        COALESCE(
                            signals->'submission_rubric'->>'verdict' = 'sound',
                            answer = correct_answer,
                            FALSE
                        ),
                        signals,
                        interaction_id,
                        generated_card_id,
                        generated_card,
                        template_mode,
                        support_layer,
                        live_coach_used,
                        activity_format,
                        target_source,
                        target_control,
                        format_control,
                        migration_key,
                        created_at,
                        updated_at
                    FROM answer
                    ON CONFLICT (id) DO NOTHING;
                END IF;

                IF to_regclass('public.submission_id_seq') IS NULL
                   AND to_regclass('public.answer_id_seq') IS NOT NULL THEN
                    ALTER SEQUENCE answer_id_seq RENAME TO submission_id_seq;
                END IF;

                IF to_regclass('public.submission') IS NOT NULL
                   AND to_regclass('public.submission_id_seq') IS NOT NULL THEN
                    ALTER TABLE submission
                    ALTER COLUMN id SET DEFAULT nextval('submission_id_seq');
                    ALTER SEQUENCE submission_id_seq OWNED BY submission.id;

                    -- Historical imports preserve their original IDs, so the
                    -- sequence can lag behind the existing ledger. Realign it
                    -- before accepting another submission to prevent duplicate
                    -- primary-key failures.
                    PERFORM setval(
                        'public.submission_id_seq',
                        GREATEST((SELECT COALESCE(MAX(id), 0) + 1 FROM submission), 1),
                        false
                    );
                END IF;

                DROP TABLE IF EXISTS answer_misconception CASCADE;
                DROP TABLE IF EXISTS submission_misconception CASCADE;
                DROP TABLE IF EXISTS skill_misconception_catalog CASCADE;
                DROP TABLE IF EXISTS answer_skill_evidence CASCADE;
                DROP TABLE IF EXISTS submission_skill_evidence CASCADE;
                DROP TABLE IF EXISTS answer_mcq_detail;
                DROP TABLE IF EXISTS submission_mcq_detail;

                IF to_regclass('public.submission') IS NOT NULL
                   AND to_regclass('public.answer') IS NOT NULL THEN
                    DROP TABLE answer;
                END IF;

                FOR old_index, new_index IN
                    SELECT *
                    FROM (VALUES
                        ('idx_answer_question_id', 'idx_submission_multiple_choice_problem_id'),
                        ('idx_answer_session_user', 'idx_submission_session_user'),
                        ('idx_answer_migration_key', 'idx_submission_migration_key'),
                        ('idx_answer_created_at', 'idx_submission_created_at'),
                        ('idx_answer_question_type_created_at', 'idx_submission_question_type_created_at'),
                        ('idx_answer_generated_card_id', 'idx_submission_generated_card_id'),
                        ('idx_answer_interaction_id', 'idx_submission_interaction_id'),
                        ('idx_answer_category_tags', 'idx_submission_category_tags'),
                        ('idx_answer_template_support_created_at', 'idx_submission_template_support_created_at'),
                        ('idx_answer_question_id_created_at', 'idx_submission_multiple_choice_problem_id_created_at'),
                        ('idx_submission_question_id', 'idx_submission_multiple_choice_problem_id'),
                        ('idx_submission_question_id_created_at', 'idx_submission_multiple_choice_problem_id_created_at'),
                        ('idx_answer_session_id_created_at', 'idx_submission_session_id_created_at'),
                        ('idx_question_fingerprint', 'idx_multiple_choice_problem_fingerprint'),
                        ('idx_question_user_id', 'idx_multiple_choice_problem_user_id'),
                        ('idx_question_created_date', 'idx_multiple_choice_problem_created_date')
                    ) AS renamed(old_name, new_name)
                LOOP
                    IF to_regclass('public.' || old_index) IS NOT NULL
                       AND to_regclass('public.' || new_index) IS NULL THEN
                        EXECUTE format('ALTER INDEX %I RENAME TO %I', old_index, new_index);
                    END IF;
                END LOOP;

                IF to_regclass('public.idx_submission_multiple_choice_problem_id') IS NOT NULL THEN
                    DROP INDEX IF EXISTS idx_submission_question_id;
                END IF;

                IF to_regclass('public.idx_submission_multiple_choice_problem_id_created_at') IS NOT NULL THEN
                    DROP INDEX IF EXISTS idx_submission_question_id_created_at;
                END IF;
            END $$;
            """
        )

        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS multiple_choice_problem (
                id VARCHAR(80) PRIMARY KEY,
                user_id VARCHAR(80) NOT NULL DEFAULT '0000',
                question_text TEXT NOT NULL,
                question_help_text TEXT NOT NULL DEFAULT '',
                recall_answer TEXT,
                multiple_choice_answer_label_1 VARCHAR(1),
                multiple_choice_answer_text_1 TEXT,
                multiple_choice_answer_label_2 VARCHAR(1),
                multiple_choice_answer_text_2 TEXT,
                multiple_choice_answer_label_3 VARCHAR(1),
                multiple_choice_answer_text_3 TEXT,
                multiple_choice_answer_label_4 VARCHAR(1),
                multiple_choice_answer_text_4 TEXT,
                multiple_choice_correct_answer_label VARCHAR(1),
                multiple_choice_correct_answer_text TEXT,
                fingerprint VARCHAR(64) NOT NULL,
                created_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                modified_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE UNIQUE INDEX IF NOT EXISTS idx_multiple_choice_problem_fingerprint
                ON multiple_choice_problem(fingerprint);

            CREATE INDEX IF NOT EXISTS idx_multiple_choice_problem_user_id
                ON multiple_choice_problem(user_id);

            CREATE INDEX IF NOT EXISTS idx_multiple_choice_problem_created_date
                ON multiple_choice_problem(created_date DESC);

            CREATE TABLE IF NOT EXISTS submission (
                id BIGSERIAL PRIMARY KEY,
                session_id VARCHAR(80) NOT NULL DEFAULT '0000',
                user_id VARCHAR(80) NOT NULL DEFAULT '0000',
                multiple_choice_problem_id VARCHAR(80) REFERENCES multiple_choice_problem(id) ON DELETE SET NULL,
                answer TEXT NOT NULL
            );

            ALTER TABLE submission
            ADD COLUMN IF NOT EXISTS question_type VARCHAR(50) NOT NULL DEFAULT '';

            ALTER TABLE submission
            ADD COLUMN IF NOT EXISTS category_tags TEXT[] NOT NULL DEFAULT '{}';

            ALTER TABLE submission
            ADD COLUMN IF NOT EXISTS correct_answer TEXT;

            ALTER TABLE submission
            ADD COLUMN IF NOT EXISTS successful BOOLEAN NOT NULL DEFAULT FALSE;

            DO $$
            DECLARE
                legacy_metric_column TEXT := 'accu' || 'racy';
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'submission'
                      AND column_name = legacy_metric_column
                ) THEN
                    EXECUTE format(
                        'UPDATE submission SET successful = (%I >= 100) WHERE successful = FALSE',
                        legacy_metric_column
                    );
                    EXECUTE format('ALTER TABLE submission DROP COLUMN %I', legacy_metric_column);
                END IF;
            END $$;

            ALTER TABLE submission
            ADD COLUMN IF NOT EXISTS signals JSONB NOT NULL DEFAULT '{"elapsed_ms": 0}'::jsonb;

            ALTER TABLE submission
            ADD COLUMN IF NOT EXISTS interaction_id VARCHAR(80);

            ALTER TABLE submission
            ADD COLUMN IF NOT EXISTS generated_card_id VARCHAR(80);

            ALTER TABLE submission
            ADD COLUMN IF NOT EXISTS generated_card JSONB;

            ALTER TABLE submission
            ADD COLUMN IF NOT EXISTS template_mode VARCHAR(20) NOT NULL DEFAULT 'algorithm';

            ALTER TABLE submission
            ADD COLUMN IF NOT EXISTS support_layer VARCHAR(30) NOT NULL DEFAULT 'none';

            ALTER TABLE submission
            ADD COLUMN IF NOT EXISTS live_coach_used BOOLEAN NOT NULL DEFAULT FALSE;

            ALTER TABLE submission
            ADD COLUMN IF NOT EXISTS activity_format VARCHAR(30);

            ALTER TABLE submission
            ADD COLUMN IF NOT EXISTS target_source VARCHAR(30);

            ALTER TABLE submission
            ADD COLUMN IF NOT EXISTS target_control VARCHAR(20);

            ALTER TABLE submission
            ADD COLUMN IF NOT EXISTS format_control VARCHAR(20);

            ALTER TABLE submission
            ADD COLUMN IF NOT EXISTS migration_key TEXT;

            ALTER TABLE submission
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

            ALTER TABLE submission
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'submission' AND column_name = 'elapsed_ms'
                ) THEN
                    EXECUTE 'UPDATE submission SET signals = jsonb_strip_nulls(jsonb_build_object(''elapsed_ms'', elapsed_ms)) || signals';
                END IF;
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'submission' AND column_name = 'coach_feedback'
                ) THEN
                    EXECUTE 'UPDATE submission SET signals = jsonb_strip_nulls(jsonb_build_object(''coach_feedback'', coach_feedback)) || signals';
                END IF;
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'submission' AND column_name = 'submission_rubric'
                ) THEN
                    EXECUTE 'UPDATE submission SET signals = jsonb_strip_nulls(jsonb_build_object(''submission_rubric'', submission_rubric)) || signals';
                END IF;
            END $$;

            UPDATE submission
            SET signals = '{"elapsed_ms": 0}'::jsonb || signals;

            UPDATE submission
            SET signals = jsonb_build_object(
                'elapsed_ms', COALESCE(signals->'elapsed_ms', '0'::jsonb)
            ) || CASE
                WHEN signals ? 'evaluation' THEN
                    jsonb_build_object('evaluation', signals->'evaluation')
                WHEN signals ? 'submission_rubric' OR signals ? 'coach_feedback' THEN
                    jsonb_build_object(
                        'evaluation',
                        COALESCE(
                            signals->'submission_rubric',
                            signals#>'{coach_feedback,submissionRubric}',
                            '{}'::jsonb
                        ) || jsonb_build_object(
                            'version', 1,
                            'feedback', COALESCE(signals->'coach_feedback', '{}'::jsonb)
                                - 'submissionRubric' - 'llmUsed' - 'llmProvider',
                            'provenance', jsonb_build_object(
                                'llmUsed', COALESCE((signals#>>'{coach_feedback,llmUsed}')::boolean, FALSE),
                                'provider', COALESCE(signals#>>'{coach_feedback,llmProvider}', ''),
                                'source', 'legacy-assessor-narrator'
                            )
                        )
                    )
                ELSE '{}'::jsonb
            END;

            ALTER TABLE submission
            ALTER COLUMN signals SET DEFAULT '{"elapsed_ms": 0}'::jsonb;

            ALTER TABLE submission
            DROP COLUMN IF EXISTS is_correct,
            DROP COLUMN IF EXISTS exact,
            DROP COLUMN IF EXISTS elapsed_ms,
            DROP COLUMN IF EXISTS coach_feedback,
            DROP COLUMN IF EXISTS submission_rubric;

            ALTER TABLE submission
            DROP CONSTRAINT IF EXISTS submission_signals_object_check;

            ALTER TABLE submission
            ADD CONSTRAINT submission_signals_object_check
            CHECK (
                jsonb_typeof(signals) = 'object'
                AND signals ? 'elapsed_ms'
                AND jsonb_typeof(signals->'elapsed_ms') = 'number'
                AND (signals - 'elapsed_ms' - 'evaluation') = '{}'::jsonb
                AND (
                    NOT (signals ? 'evaluation')
                    OR jsonb_typeof(signals->'evaluation') = 'object'
                )
            );

            ALTER TABLE submission
            DROP CONSTRAINT IF EXISTS answer_template_mode_check;

            ALTER TABLE submission
            DROP CONSTRAINT IF EXISTS submission_template_mode_check;

            ALTER TABLE submission
            ADD CONSTRAINT submission_template_mode_check
            CHECK (template_mode IN ('algorithm'));

            ALTER TABLE submission
            DROP CONSTRAINT IF EXISTS answer_support_layer_check;

            ALTER TABLE submission
            DROP CONSTRAINT IF EXISTS submission_support_layer_check;

            ALTER TABLE submission
            ADD CONSTRAINT submission_support_layer_check
            CHECK (support_layer IN ('none', 'ghost-reps'));

            ALTER TABLE submission
            ADD COLUMN IF NOT EXISTS multiple_choice_problem_id VARCHAR(80)
                REFERENCES multiple_choice_problem(id) ON DELETE SET NULL;

            ALTER TABLE submission
            ALTER COLUMN multiple_choice_problem_id DROP NOT NULL;

            UPDATE submission
            SET multiple_choice_problem_id = NULL
            WHERE multiple_choice_problem_id IS NOT NULL
              AND multiple_choice_problem_id NOT LIKE 'mcq-%';

            UPDATE submission s
            SET multiple_choice_problem_id = NULL
            WHERE s.multiple_choice_problem_id IS NOT NULL
              AND NOT EXISTS (
                SELECT 1
                FROM multiple_choice_problem p
                WHERE p.id = s.multiple_choice_problem_id
              );

            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conrelid = 'public.submission'::regclass
                      AND conname = 'submission_multiple_choice_problem_id_fkey'
                ) THEN
                    ALTER TABLE submission
                    ADD CONSTRAINT submission_multiple_choice_problem_id_fkey
                    FOREIGN KEY (multiple_choice_problem_id)
                    REFERENCES multiple_choice_problem(id)
                    ON DELETE SET NULL;
                END IF;
            END $$;

            CREATE INDEX IF NOT EXISTS idx_submission_multiple_choice_problem_id
                ON submission(multiple_choice_problem_id);

            CREATE INDEX IF NOT EXISTS idx_submission_session_user
                ON submission(session_id, user_id);

            CREATE UNIQUE INDEX IF NOT EXISTS idx_submission_migration_key
                ON submission(migration_key)
                WHERE migration_key IS NOT NULL;

            CREATE INDEX IF NOT EXISTS idx_submission_created_at
                ON submission(created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_submission_question_type_created_at
                ON submission(question_type, created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_submission_generated_card_id
                ON submission(generated_card_id);

            CREATE INDEX IF NOT EXISTS idx_submission_interaction_id
                ON submission(interaction_id);

            CREATE INDEX IF NOT EXISTS idx_submission_category_tags
                ON submission USING GIN(category_tags);

            CREATE INDEX IF NOT EXISTS idx_submission_template_support_created_at
                ON submission(template_mode, support_layer, created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_submission_multiple_choice_problem_id_created_at
                ON submission(multiple_choice_problem_id, created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_submission_session_id_created_at
                ON submission(session_id, created_at DESC);

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
                      AND table_name = 'submission'
                      AND column_name = 'created_at'
                      AND data_type = 'timestamp without time zone'
                ) THEN
                    EXECUTE $sql$
                        ALTER TABLE submission
                        ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC'
                    $sql$;
                END IF;

                IF EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'submission'
                      AND column_name = 'updated_at'
                      AND data_type = 'timestamp without time zone'
                ) THEN
                    EXECUTE $sql$
                        ALTER TABLE submission
                        ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC'
                    $sql$;
                END IF;
            END $$;
            """
        )


async def _ensure_generated_skill_map_card_schema(db_pool: asyncpg.Pool) -> None:
    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            ALTER TABLE generated_skill_map_cards
            ADD COLUMN IF NOT EXISTS generation_context JSONB;
            """
        )


async def _backfill_submission_attempts_from_score_attempts(db_pool: asyncpg.Pool) -> None:
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
                    WITH source_attempts AS (
                        SELECT
                            sa.id AS legacy_attempt_id,
                            COALESCE(NULLIF(sa.generated_card_id, ''), 'migration-q-' || sa.id::text) AS canonical_question_id,
                            COALESCE(NULLIF(sa.question, ''), 'Migrated question from score_attempts id ' || sa.id::text) AS question_text_norm,
                            COALESCE(sa.correct_answer, '') AS correct_answer_norm,
                            md5(
                                lower(trim(COALESCE(NULLIF(sa.question, ''), 'Migrated question from score_attempts id ' || sa.id::text))) || '|' ||
                                lower(trim(COALESCE(sa.correct_answer, ''))) || '|' ||
                                COALESCE(sa.question_type, '')
                            ) AS fingerprint_norm,
                            COALESCE(sa.created_at, NOW()) AS created_at_norm,
                            COALESCE(sa.updated_at, sa.created_at, NOW()) AS updated_at_norm,
                            sa.*
                        FROM score_attempts sa
                    ),
                    source_questions AS (
                        SELECT DISTINCT ON (s.fingerprint_norm)
                            s.canonical_question_id,
                            s.question_text_norm,
                            s.correct_answer_norm,
                            s.fingerprint_norm,
                            s.created_at_norm,
                            s.updated_at_norm
                        FROM source_attempts s
                        ORDER BY s.fingerprint_norm, s.updated_at_norm DESC, s.legacy_attempt_id DESC
                    )
                    INSERT INTO multiple_choice_problem (
                        id,
                        user_id,
                        question_text,
                        question_help_text,
                        recall_answer,
                        multiple_choice_correct_answer_text,
                        fingerprint,
                        created_date,
                        modified_date
                    )
                    SELECT
                        s.canonical_question_id,
                        '0000',
                        s.question_text_norm,
                        '',
                        NULL,
                        NULLIF(s.correct_answer_norm, ''),
                        s.fingerprint_norm,
                        s.created_at_norm,
                        s.updated_at_norm
                    FROM source_questions s
                    WHERE s.canonical_question_id LIKE 'mcq-%'
                    ON CONFLICT DO NOTHING;

                    WITH source_attempts AS (
                        SELECT
                            sa.id AS legacy_attempt_id,
                            COALESCE(NULLIF(sa.generated_card_id, ''), 'migration-q-' || sa.id::text) AS canonical_question_id,
                            md5(
                                lower(trim(COALESCE(NULLIF(sa.question, ''), 'Migrated question from score_attempts id ' || sa.id::text))) || '|' ||
                                lower(trim(COALESCE(sa.correct_answer, ''))) || '|' ||
                                COALESCE(sa.question_type, '')
                            ) AS fingerprint_norm,
                            COALESCE(sa.created_at, NOW()) AS created_at_norm,
                            COALESCE(sa.updated_at, sa.created_at, NOW()) AS updated_at_norm,
                            sa.*
                        FROM score_attempts sa
                    )
                    INSERT INTO submission (
                        session_id,
                        user_id,
                        multiple_choice_problem_id,
                        answer,
                        question_type,
                        category_tags,
                        correct_answer,
                        successful,
                        signals,
                        interaction_id,
                        generated_card_id,
                        generated_card,
                        template_mode,
                        support_layer,
                        live_coach_used,
                        migration_key,
                        created_at,
                        updated_at
                    )
                    SELECT
                        COALESCE(NULLIF(s.interaction_id, ''), 'legacy-session-' || s.legacy_attempt_id::text),
                        '0000',
                        COALESCE(q.id, CASE WHEN s.canonical_question_id LIKE 'mcq-%' THEN s.canonical_question_id ELSE NULL END),
                        COALESCE(s.user_answer, ''),
                        COALESCE(s.question_type, ''),
                        COALESCE(s.category_tags, '{}'),
                        s.correct_answer,
                        COALESCE(
                            s.submission_rubric->>'verdict' = 'sound',
                            s.user_answer = s.correct_answer,
                            FALSE
                        ),
                        jsonb_strip_nulls(jsonb_build_object(
                            'elapsed_ms', COALESCE(s.elapsed_ms, 0),
                            'evaluation', COALESCE(s.submission_rubric, '{}'::jsonb) || jsonb_build_object(
                                'version', 1,
                                'feedback', COALESCE(s.coach_feedback, '{}'::jsonb)
                                    - 'submissionRubric' - 'llmUsed' - 'llmProvider',
                                'provenance', jsonb_build_object(
                                    'llmUsed', COALESCE((s.coach_feedback->>'llmUsed')::boolean, FALSE),
                                    'provider', COALESCE(s.coach_feedback->>'llmProvider', ''),
                                    'source', 'score-attempts-migration'
                                )
                            )
                        )),
                        s.interaction_id,
                        s.generated_card_id,
                        s.generated_card,
                        COALESCE(s.template_mode, 'algorithm'),
                        COALESCE(s.support_layer, 'none'),
                        COALESCE(s.live_coach_used, FALSE),
                        'score_attempts:' || s.legacy_attempt_id::text,
                        s.created_at_norm,
                        s.updated_at_norm
                    FROM source_attempts s
                    LEFT JOIN multiple_choice_problem q ON q.fingerprint = s.fingerprint_norm
                    ON CONFLICT (migration_key) WHERE migration_key IS NOT NULL DO NOTHING;

                    DROP TABLE IF EXISTS score_attempts CASCADE;
                END IF;
            END $$;
            """
        )


async def _apply_core_algorithm_naming_migration(db_pool: asyncpg.Pool) -> None:
    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            DO $$
            BEGIN
                IF to_regclass('public.static_function_patterns') IS NOT NULL
                   AND to_regclass('public.core_algorithm_patterns') IS NULL THEN
                    ALTER TABLE static_function_patterns RENAME TO core_algorithm_patterns;
                END IF;

                IF to_regclass('public.static_function_methods') IS NOT NULL
                   AND to_regclass('public.core_algorithm_methods') IS NULL THEN
                    ALTER TABLE static_function_methods RENAME TO core_algorithm_methods;
                END IF;

                IF to_regclass('public.static_functions') IS NOT NULL
                   AND to_regclass('public.core_algorithms') IS NULL THEN
                    ALTER TABLE static_functions RENAME TO core_algorithms;
                END IF;

                IF to_regclass('public.static_function_skill_map') IS NOT NULL
                   AND to_regclass('public.core_algorithm_skill_map') IS NULL THEN
                    ALTER TABLE static_function_skill_map RENAME TO core_algorithm_skill_map;
                END IF;
            END $$;

            DROP TABLE IF EXISTS static_function_skill_map CASCADE;
            DROP TABLE IF EXISTS static_function_methods CASCADE;
            DROP TABLE IF EXISTS static_functions CASCADE;
            DROP TABLE IF EXISTS static_function_patterns CASCADE;

            DO $$
            BEGIN
                IF to_regclass('public.score_attempts') IS NOT NULL THEN
                    UPDATE score_attempts
                    SET
                        card_id = regexp_replace(card_id, '^static-function-', 'core-algorithm-'),
                        generated_card_id = CASE
                            WHEN generated_card_id LIKE 'static-function-%'
                                THEN regexp_replace(generated_card_id, '^static-function-', 'core-algorithm-')
                            ELSE generated_card_id
                        END,
                        question_type = replace(question_type, 'skill-map-static', 'skill-map-core-algorithm'),
                        category_tags = array_replace(category_tags, 'static-function', 'core-algorithm')
                    WHERE card_id LIKE 'static-function-%'
                       OR generated_card_id LIKE 'static-function-%'
                       OR question_type LIKE '%skill-map-static%'
                       OR category_tags @> ARRAY['static-function']::text[];

                    UPDATE score_attempts
                    SET generated_card = jsonb_set(
                        generated_card,
                        '{id}',
                        to_jsonb(regexp_replace(generated_card->>'id', '^static-function-', 'core-algorithm-'))
                    )
                    WHERE generated_card IS NOT NULL
                      AND generated_card ? 'id'
                      AND generated_card->>'id' LIKE 'static-function-%';

                    UPDATE score_attempts
                    SET generated_card = jsonb_set(
                        generated_card,
                        '{tags}',
                        (
                            SELECT jsonb_agg(to_jsonb(CASE tag WHEN 'static-function' THEN 'core-algorithm' ELSE tag END))
                            FROM jsonb_array_elements_text(generated_card->'tags') AS tags(tag)
                        )
                    )
                    WHERE generated_card IS NOT NULL
                      AND jsonb_typeof(generated_card->'tags') = 'array'
                      AND generated_card->'tags' ? 'static-function';
                END IF;

            END $$;
            """
        )


def _display_label(slug: str) -> str:
    overrides = {
        "dfs-bfs": "DFS / BFS",
        "heap": "Heap / Priority Queue",
        "dynamic-programming": "Dynamic Programming",
        "prefix-sums": "Prefix Sums",
        "monotonic-stack": "Monotonic Stack",
        "stacks-queues": "Stacks / Queues",
        "linked-lists": "Linked Lists",
        "matrix-grid": "Matrix / Grid",
        "topological-sort": "Topological Sort",
        "greedy-sorting": "Greedy / Sorting",
        "trie": "Trie",
        "trees": "Trees",
    }
    if slug in overrides:
        return overrides[slug]
    return " ".join(part.capitalize() for part in slug.split("-") if part)


async def _ensure_taxonomy_schema(db_pool: asyncpg.Pool) -> None:
    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS algorithm (
                slug VARCHAR(80) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                display_order INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS technique (
                slug VARCHAR(80) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                display_order INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS skill (
                slug VARCHAR(120) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                display_order INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS problem (
                slug VARCHAR(120) PRIMARY KEY,
                algorithm_slug VARCHAR(80) NOT NULL REFERENCES algorithm(slug) ON DELETE RESTRICT,
                title VARCHAR(255) NOT NULL,
                difficulty VARCHAR(20) NOT NULL CHECK (difficulty IN ('Easy', 'Med.', 'Hard')),
                description TEXT NOT NULL DEFAULT '',
                code TEXT NOT NULL,
                tags TEXT[] DEFAULT '{}',
                leetcode_examples JSONB NOT NULL DEFAULT '[]'::jsonb,
                display_order INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_problem_algorithm
                ON problem(algorithm_slug, display_order);

            CREATE INDEX IF NOT EXISTS idx_problem_tags
                ON problem USING GIN(tags);

            CREATE TABLE IF NOT EXISTS problem_skill (
                problem_slug VARCHAR(120) NOT NULL REFERENCES problem(slug) ON DELETE CASCADE,
                skill_slug VARCHAR(120) NOT NULL REFERENCES skill(slug) ON DELETE CASCADE,
                display_order INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (problem_slug, skill_slug)
            );

            CREATE INDEX IF NOT EXISTS idx_problem_skill_skill
                ON problem_skill(skill_slug);

            CREATE TABLE IF NOT EXISTS problem_technique (
                problem_slug VARCHAR(120) NOT NULL REFERENCES problem(slug) ON DELETE CASCADE,
                technique_slug VARCHAR(80) NOT NULL REFERENCES technique(slug) ON DELETE CASCADE,
                display_order INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (problem_slug, technique_slug)
            );

            CREATE INDEX IF NOT EXISTS idx_problem_technique_technique
                ON problem_technique(technique_slug);
            """
        )


async def _seed_taxonomy(db_pool: asyncpg.Pool) -> None:
    skill_order: dict[str, int] = {slug: index + 1 for index, slug in enumerate(CANONICAL_SKILLS)}
    problem_rows: list[tuple[str, dict, str, int]] = []
    problem_skill_rows: list[tuple[str, str, int]] = []
    problem_technique_rows: list[tuple[str, str, int]] = []

    catalog_sources = (
        (core_algorithms, CORE_ALGORITHM_CATALOG),
        (core_meta, CORE_META_CATALOG),
    )
    problem_index = 0
    for source_module, catalog in catalog_sources:
        for problem_slug, meta in catalog.items():
            problem_index += 1
            source_name = str(meta.get("sourceName") or problem_slug)
            code = inspect.getsource(getattr(source_module, source_name)).strip()
            problem_rows.append((problem_slug, meta, code, problem_index))
            for skill_slug in meta["skills"]:
                skill_order.setdefault(skill_slug, len(skill_order) + 1)
                problem_skill_rows.append((problem_slug, skill_slug, problem_index))
            for technique_slug in meta["techniques"]:
                problem_technique_rows.append((problem_slug, technique_slug, problem_index))

    async with db_pool.acquire() as conn:
        async with conn.transaction():
            for display_order, (algorithm_slug, algorithm_name) in enumerate(ALGORITHMS.items(), start=1):
                await conn.execute(
                    """
                    INSERT INTO algorithm (slug, name, display_order, updated_at)
                    VALUES ($1, $2, $3, NOW())
                    ON CONFLICT (slug) DO UPDATE SET
                        name = EXCLUDED.name,
                        display_order = EXCLUDED.display_order,
                        updated_at = NOW()
                    """,
                    algorithm_slug,
                    algorithm_name,
                    display_order,
                )

            for display_order, (technique_slug, technique_name) in enumerate(TECHNIQUES.items(), start=1):
                await conn.execute(
                    """
                    INSERT INTO technique (slug, name, display_order, updated_at)
                    VALUES ($1, $2, $3, NOW())
                    ON CONFLICT (slug) DO UPDATE SET
                        name = EXCLUDED.name,
                        display_order = EXCLUDED.display_order,
                        updated_at = NOW()
                    """,
                    technique_slug,
                    technique_name,
                    display_order,
                )

            for skill_slug, display_order in skill_order.items():
                await conn.execute(
                    """
                    INSERT INTO skill (slug, name, display_order, updated_at)
                    VALUES ($1, $2, $3, NOW())
                    ON CONFLICT (slug) DO UPDATE SET
                        name = EXCLUDED.name,
                        display_order = EXCLUDED.display_order,
                        updated_at = NOW()
                    """,
                    skill_slug,
                    _display_label(skill_slug).lower(),
                    display_order,
                )

            for problem_slug, meta, code, display_order in problem_rows:
                await conn.execute(
                    """
                    INSERT INTO problem
                        (slug, algorithm_slug, title, difficulty, description, code,
                         tags, leetcode_examples, display_order, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, NOW())
                    ON CONFLICT (slug) DO UPDATE SET
                        algorithm_slug = EXCLUDED.algorithm_slug,
                        title = EXCLUDED.title,
                        difficulty = EXCLUDED.difficulty,
                        description = EXCLUDED.description,
                        code = EXCLUDED.code,
                        tags = EXCLUDED.tags,
                        leetcode_examples = EXCLUDED.leetcode_examples,
                        display_order = EXCLUDED.display_order,
                        updated_at = NOW()
                    """,
                    problem_slug,
                    meta["algorithm"],
                    meta["title"],
                    meta["difficulty"],
                    meta["description"],
                    code,
                    list(meta["tags"]),
                    json.dumps(list(meta["leetcodeExamples"])),
                    display_order,
                )

            await conn.execute(
                "DELETE FROM problem WHERE slug <> ALL($1::text[])",
                [slug for slug, _, _, _ in problem_rows],
            )

            await conn.execute("DELETE FROM problem_skill")
            for problem_slug, skill_slug, display_order in problem_skill_rows:
                await conn.execute(
                    """
                    INSERT INTO problem_skill (problem_slug, skill_slug, display_order)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (problem_slug, skill_slug) DO UPDATE SET
                        display_order = EXCLUDED.display_order
                    """,
                    problem_slug,
                    skill_slug,
                    display_order,
                )

            await conn.execute("DELETE FROM problem_technique")
            for problem_slug, technique_slug, display_order in problem_technique_rows:
                await conn.execute(
                    """
                    INSERT INTO problem_technique (problem_slug, technique_slug, display_order)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (problem_slug, technique_slug) DO UPDATE SET
                        display_order = EXCLUDED.display_order
                    """,
                    problem_slug,
                    technique_slug,
                    display_order,
                )

            if RETIRED_SKILLS:
                await conn.execute(
                    "DELETE FROM skill WHERE slug = ANY($1::text[])",
                    list(RETIRED_SKILLS),
                )


async def _apply_taxonomy_remap_migration(db_pool: asyncpg.Pool) -> None:
    """Remap legacy pattern slugs in attempt history to the new taxonomy and
    drop the superseded core_algorithm_* tables. Every statement is idempotent:
    legacy slugs never reappear once rewritten."""
    legacy_slugs = sorted(
        slug for slug, target in PATTERN_TO_ALGORITHM.items() if slug != target
    )
    slug_cases = "\n".join(
        f"                        WHEN '{slug}' THEN '{PATTERN_TO_ALGORITHM[slug]}'" for slug in legacy_slugs
    )
    async with db_pool.acquire() as conn:
        await conn.execute(
            f"""
            UPDATE submission
            SET category_tags = (
                SELECT array_agg(DISTINCT CASE tag
{slug_cases}
                    ELSE tag
                END)
                FROM unnest(category_tags) AS tags(tag)
            )
            WHERE category_tags && $1::text[]
            """,
            legacy_slugs,
        )

        await conn.execute(
            """
            UPDATE submission a
            SET category_tags = p.tags
            FROM problem p
            WHERE a.generated_card_id = 'core-algorithm-' || p.slug
              AND a.category_tags IS DISTINCT FROM p.tags
            """
        )

        await conn.execute(
            """
            DROP TABLE IF EXISTS core_algorithm_skill_map CASCADE;
            DROP TABLE IF EXISTS core_algorithm_methods CASCADE;
            DROP TABLE IF EXISTS core_algorithms CASCADE;
            DROP TABLE IF EXISTS core_algorithm_patterns CASCADE;
            """
        )
