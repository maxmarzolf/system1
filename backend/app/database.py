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
    await _ensure_practice_history_schema(pool)
    await _backfill_answer_attempts_from_score_attempts(pool)
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
        # Structural taxonomy migration for databases created before the
        # algorithm/problem/skill/technique rework: pattern_slug columns become
        # algorithm_slug, and the misconception catalog is re-keyed on the
        # global skill entity. Runs before the CREATE/seed block below so the
        # new-shape ON CONFLICT targets exist on legacy databases.
        await conn.execute(
            """
            DO $$
            BEGIN
                IF to_regclass('public.answer_skill_evidence') IS NOT NULL AND EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'answer_skill_evidence'
                      AND column_name = 'pattern_slug'
                ) THEN
                    ALTER TABLE answer_skill_evidence RENAME COLUMN pattern_slug TO algorithm_slug;
                END IF;

                IF to_regclass('public.answer_misconception') IS NOT NULL AND EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'answer_misconception'
                      AND column_name = 'pattern_slug'
                ) THEN
                    ALTER TABLE answer_misconception RENAME COLUMN pattern_slug TO algorithm_slug;
                END IF;

                IF to_regclass('public.skill_misconception_catalog') IS NOT NULL AND EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'skill_misconception_catalog'
                      AND column_name = 'pattern_slug'
                ) THEN
                    DELETE FROM skill_misconception_catalog a
                    USING skill_misconception_catalog b
                    WHERE a.id > b.id
                      AND a.skill_slug = b.skill_slug
                      AND a.misconception_tag = b.misconception_tag;

                    ALTER TABLE skill_misconception_catalog DROP COLUMN pattern_slug;
                END IF;

                IF to_regclass('public.skill_misconception_catalog') IS NOT NULL AND NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conrelid = 'public.skill_misconception_catalog'::regclass
                      AND conname = 'skill_misconception_catalog_skill_slug_misconception_tag_key'
                ) THEN
                    ALTER TABLE skill_misconception_catalog
                    ADD CONSTRAINT skill_misconception_catalog_skill_slug_misconception_tag_key
                    UNIQUE (skill_slug, misconception_tag);
                END IF;
            END $$;
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS question (
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

            CREATE UNIQUE INDEX IF NOT EXISTS idx_question_fingerprint
                ON question(fingerprint);

            CREATE INDEX IF NOT EXISTS idx_question_user_id
                ON question(user_id);

            CREATE INDEX IF NOT EXISTS idx_question_created_date
                ON question(created_date DESC);

            CREATE TABLE IF NOT EXISTS answer (
                id BIGSERIAL PRIMARY KEY,
                session_id VARCHAR(80) NOT NULL DEFAULT '0000',
                user_id VARCHAR(80) NOT NULL DEFAULT '0000',
                question_id VARCHAR(80) NOT NULL REFERENCES question(id),
                answer TEXT NOT NULL
            );

            ALTER TABLE answer
            ADD COLUMN IF NOT EXISTS question_type VARCHAR(50) NOT NULL DEFAULT '';

            ALTER TABLE answer
            ADD COLUMN IF NOT EXISTS category_tags TEXT[] NOT NULL DEFAULT '{}';

            ALTER TABLE answer
            ADD COLUMN IF NOT EXISTS correct_answer TEXT;

            ALTER TABLE answer
            ADD COLUMN IF NOT EXISTS is_correct BOOLEAN NOT NULL DEFAULT FALSE;

            ALTER TABLE answer
            ADD COLUMN IF NOT EXISTS accuracy REAL NOT NULL DEFAULT 0 CHECK (accuracy >= 0 AND accuracy <= 100);

            ALTER TABLE answer
            ADD COLUMN IF NOT EXISTS exact BOOLEAN NOT NULL DEFAULT FALSE;

            ALTER TABLE answer
            ADD COLUMN IF NOT EXISTS elapsed_ms INTEGER NOT NULL DEFAULT 0 CHECK (elapsed_ms >= 0);

            ALTER TABLE answer
            ADD COLUMN IF NOT EXISTS interaction_id VARCHAR(80);

            ALTER TABLE answer
            ADD COLUMN IF NOT EXISTS generated_card_id VARCHAR(80);

            ALTER TABLE answer
            ADD COLUMN IF NOT EXISTS generated_card JSONB;

            ALTER TABLE answer
            ADD COLUMN IF NOT EXISTS template_mode VARCHAR(20) NOT NULL DEFAULT 'algorithm';

            ALTER TABLE answer
            ADD COLUMN IF NOT EXISTS support_layer VARCHAR(30) NOT NULL DEFAULT 'none';

            ALTER TABLE answer
            ADD COLUMN IF NOT EXISTS live_coach_used BOOLEAN NOT NULL DEFAULT FALSE;

            ALTER TABLE answer
            ADD COLUMN IF NOT EXISTS coach_feedback JSONB;

            ALTER TABLE answer
            ADD COLUMN IF NOT EXISTS submission_rubric JSONB;

            ALTER TABLE answer
            ADD COLUMN IF NOT EXISTS activity_format VARCHAR(30);

            ALTER TABLE answer
            ADD COLUMN IF NOT EXISTS target_source VARCHAR(30);

            ALTER TABLE answer
            ADD COLUMN IF NOT EXISTS target_control VARCHAR(20);

            ALTER TABLE answer
            ADD COLUMN IF NOT EXISTS format_control VARCHAR(20);

            ALTER TABLE answer
            ADD COLUMN IF NOT EXISTS migration_key TEXT;

            ALTER TABLE answer
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

            ALTER TABLE answer
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

            ALTER TABLE answer
            DROP CONSTRAINT IF EXISTS answer_template_mode_check;

            ALTER TABLE answer
            ADD CONSTRAINT answer_template_mode_check
            CHECK (template_mode IN ('algorithm'));

            ALTER TABLE answer
            DROP CONSTRAINT IF EXISTS answer_support_layer_check;

            ALTER TABLE answer
            ADD CONSTRAINT answer_support_layer_check
            CHECK (support_layer IN ('none', 'ghost-reps'));

            CREATE INDEX IF NOT EXISTS idx_answer_question_id
                ON answer(question_id);

            CREATE INDEX IF NOT EXISTS idx_answer_session_user
                ON answer(session_id, user_id);

            CREATE UNIQUE INDEX IF NOT EXISTS idx_answer_migration_key
                ON answer(migration_key)
                WHERE migration_key IS NOT NULL;

            CREATE INDEX IF NOT EXISTS idx_answer_created_at
                ON answer(created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_answer_question_type_created_at
                ON answer(question_type, created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_answer_generated_card_id
                ON answer(generated_card_id);

            CREATE INDEX IF NOT EXISTS idx_answer_interaction_id
                ON answer(interaction_id);

            CREATE INDEX IF NOT EXISTS idx_answer_category_tags
                ON answer USING GIN(category_tags);

            CREATE INDEX IF NOT EXISTS idx_answer_template_support_created_at
                ON answer(template_mode, support_layer, created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_answer_question_id_created_at
                ON answer(question_id, created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_answer_session_id_created_at
                ON answer(session_id, created_at DESC);

            CREATE TABLE IF NOT EXISTS answer_mcq_detail (
                answer_id BIGINT PRIMARY KEY REFERENCES answer(id) ON DELETE CASCADE,
                selected_choice_label VARCHAR(10) NOT NULL,
                correct_choice_label VARCHAR(10) NOT NULL,
                reasoning TEXT,
                reasoning_quality REAL CHECK (reasoning_quality >= 0 AND reasoning_quality <= 1),
                reasoning_evaluation JSONB,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS answer_skill_evidence (
                id BIGSERIAL PRIMARY KEY,
                answer_id BIGINT NOT NULL REFERENCES answer(id) ON DELETE CASCADE,
                algorithm_slug TEXT NOT NULL,
                skill_slug TEXT NOT NULL,
                evidence_score REAL NOT NULL CHECK (evidence_score >= 0 AND evidence_score <= 1),
                confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
                evidence_source TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_answer_skill_evidence_skill
                ON answer_skill_evidence(algorithm_slug, skill_slug, created_at DESC);

            CREATE TABLE IF NOT EXISTS skill_misconception_catalog (
                id BIGSERIAL PRIMARY KEY,
                skill_slug TEXT NOT NULL,
                misconception_tag TEXT NOT NULL,
                label TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                active BOOLEAN NOT NULL DEFAULT TRUE,
                CONSTRAINT skill_misconception_catalog_skill_slug_misconception_tag_key
                    UNIQUE (skill_slug, misconception_tag)
            );

            INSERT INTO skill_misconception_catalog
                (skill_slug, misconception_tag, label, description)
            VALUES
                ('state-definition', 'insufficient-state', 'Insufficient state', 'The state omits information needed to determine future decisions.'),
                ('state-definition', 'redundant-state', 'Redundant state', 'The state stores information already implied by other dimensions.'),
                ('state-definition', 'state-transition-confusion', 'State/transition confusion', 'The learner describes how state changes instead of what the state means.'),
                ('state-definition', 'unclear-dimensions', 'Unclear dimensions', 'One or more state dimensions do not have a precise meaning.'),
                ('state-definition', 'future-state-collision', 'Future state collision', 'One state merges subproblems that require different future decisions.')
            ON CONFLICT (skill_slug, misconception_tag) DO NOTHING;

            CREATE TABLE IF NOT EXISTS answer_misconception (
                id BIGSERIAL PRIMARY KEY,
                answer_id BIGINT NOT NULL REFERENCES answer(id) ON DELETE CASCADE,
                skill_evidence_id BIGINT REFERENCES answer_skill_evidence(id) ON DELETE SET NULL,
                misconception_id BIGINT REFERENCES skill_misconception_catalog(id) ON DELETE SET NULL,
                algorithm_slug TEXT NOT NULL,
                skill_slug TEXT NOT NULL,
                misconception_tag TEXT NOT NULL,
                evaluator_note TEXT,
                confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
                detected_by TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            ALTER TABLE answer_misconception
            ADD COLUMN IF NOT EXISTS misconception_id BIGINT
                REFERENCES skill_misconception_catalog(id) ON DELETE SET NULL;

            CREATE INDEX IF NOT EXISTS idx_answer_misconception_signal
                ON answer_misconception(algorithm_slug, skill_slug, misconception_tag, created_at DESC);
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
                      AND table_name = 'answer'
                      AND column_name = 'created_at'
                      AND data_type = 'timestamp without time zone'
                ) THEN
                    EXECUTE $sql$
                        ALTER TABLE answer
                        ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC'
                    $sql$;
                END IF;

                IF EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'answer'
                      AND column_name = 'updated_at'
                      AND data_type = 'timestamp without time zone'
                ) THEN
                    EXECUTE $sql$
                        ALTER TABLE answer
                        ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC'
                    $sql$;
                END IF;
            END $$;
            """
        )


async def _ensure_practice_history_schema(db_pool: asyncpg.Pool) -> None:
    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            ALTER TABLE generated_skill_map_cards
            ADD COLUMN IF NOT EXISTS generation_context JSONB;

            CREATE TABLE IF NOT EXISTS coach_feedback_events (
                id SERIAL PRIMARY KEY,
                interaction_id VARCHAR(80),
                card_id VARCHAR(80) NOT NULL,
                answer_id BIGINT REFERENCES answer(id) ON DELETE SET NULL,
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
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            ALTER TABLE coach_feedback_events
            ADD COLUMN IF NOT EXISTS live_mode BOOLEAN NOT NULL DEFAULT FALSE;

            ALTER TABLE coach_feedback_events
            ADD COLUMN IF NOT EXISTS live_milestones JSONB;

            ALTER TABLE coach_feedback_events
            ADD COLUMN IF NOT EXISTS answer_id BIGINT REFERENCES answer(id) ON DELETE SET NULL;

            CREATE INDEX IF NOT EXISTS idx_coach_feedback_events_interaction
                ON coach_feedback_events(interaction_id);

            CREATE INDEX IF NOT EXISTS idx_coach_feedback_events_card
                ON coach_feedback_events(card_id);

            CREATE INDEX IF NOT EXISTS idx_coach_feedback_events_generated_card
                ON coach_feedback_events(generated_card_id);

            CREATE INDEX IF NOT EXISTS idx_coach_feedback_events_answer_id
                ON coach_feedback_events(answer_id);

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
                      AND column_name = 'created_at'
                      AND data_type = 'timestamp without time zone'
                ) THEN
                    EXECUTE $sql$
                        ALTER TABLE coach_feedback_events
                        ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC'
                    $sql$;
                END IF;
            END $$;
            """
        )
        await conn.execute(
            """
            UPDATE coach_feedback_events fe
            SET answer_id = a.id
            FROM answer a
            WHERE fe.answer_id IS NULL
              AND fe.interaction_id IS NOT NULL
              AND fe.interaction_id <> ''
              AND a.interaction_id = fe.interaction_id;
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


async def _backfill_answer_attempts_from_score_attempts(db_pool: asyncpg.Pool) -> None:
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
                    INSERT INTO question (
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
                    INSERT INTO answer (
                        session_id,
                        user_id,
                        question_id,
                        answer,
                        question_type,
                        category_tags,
                        correct_answer,
                        is_correct,
                        accuracy,
                        exact,
                        elapsed_ms,
                        interaction_id,
                        generated_card_id,
                        generated_card,
                        template_mode,
                        support_layer,
                        live_coach_used,
                        coach_feedback,
                        submission_rubric,
                        migration_key,
                        created_at,
                        updated_at
                    )
                    SELECT
                        COALESCE(NULLIF(s.interaction_id, ''), 'legacy-session-' || s.legacy_attempt_id::text),
                        '0000',
                        COALESCE(q.id, s.canonical_question_id),
                        COALESCE(s.user_answer, ''),
                        COALESCE(s.question_type, ''),
                        COALESCE(s.category_tags, '{}'),
                        s.correct_answer,
                        COALESCE(s.correct, FALSE),
                        COALESCE(s.accuracy, 0),
                        COALESCE(s.exact, FALSE),
                        COALESCE(s.elapsed_ms, 0),
                        s.interaction_id,
                        s.generated_card_id,
                        s.generated_card,
                        COALESCE(s.template_mode, 'algorithm'),
                        COALESCE(s.support_layer, 'none'),
                        COALESCE(s.live_coach_used, FALSE),
                        s.coach_feedback,
                        s.submission_rubric,
                        'score_attempts:' || s.legacy_attempt_id::text,
                        s.created_at_norm,
                        s.updated_at_norm
                    FROM source_attempts s
                    LEFT JOIN question q ON q.fingerprint = s.fingerprint_norm
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

                IF to_regclass('public.coach_feedback_events') IS NOT NULL THEN
                    UPDATE coach_feedback_events
                    SET
                        card_id = regexp_replace(card_id, '^static-function-', 'core-algorithm-'),
                        generated_card_id = CASE
                            WHEN generated_card_id LIKE 'static-function-%'
                                THEN regexp_replace(generated_card_id, '^static-function-', 'core-algorithm-')
                            ELSE generated_card_id
                        END,
                        question_type = replace(question_type, 'skill-map-static', 'skill-map-core-algorithm'),
                        skill_tags = array_replace(skill_tags, 'static-function', 'core-algorithm')
                    WHERE card_id LIKE 'static-function-%'
                       OR generated_card_id LIKE 'static-function-%'
                       OR question_type LIKE '%skill-map-static%'
                       OR skill_tags @> ARRAY['static-function']::text[];
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
        f"            WHEN '{slug}' THEN '{PATTERN_TO_ALGORITHM[slug]}'" for slug in legacy_slugs
    )
    async with db_pool.acquire() as conn:
        for table in ("answer_skill_evidence", "answer_misconception"):
            await conn.execute(
                f"""
                UPDATE {table}
                SET algorithm_slug = CASE algorithm_slug
{slug_cases}
                    ELSE algorithm_slug
                END
                WHERE algorithm_slug = ANY($1::text[])
                """,
                legacy_slugs,
            )

        for table, column in (("answer", "category_tags"), ("coach_feedback_events", "skill_tags")):
            await conn.execute(
                f"""
                UPDATE {table}
                SET {column} = (
                    SELECT array_agg(DISTINCT CASE tag
{slug_cases}
                        ELSE tag
                    END)
                    FROM unnest({column}) AS tags(tag)
                )
                WHERE {column} && $1::text[]
                """,
                legacy_slugs,
            )

        await conn.execute(
            """
            UPDATE answer a
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
