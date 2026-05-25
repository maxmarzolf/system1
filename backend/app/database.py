from __future__ import annotations

import inspect
import json

import asyncpg

from app.config import settings
from app.core import static_functions
from app.core.static_function_catalog import STATIC_FUNCTION_CATALOG

pool: asyncpg.Pool | None = None


async def connect() -> asyncpg.Pool:
    global pool
    pool = await asyncpg.create_pool(settings.database_url)
    await _apply_storage_cleanup(pool)
    await _ensure_recall_history_schema(pool)
    await _ensure_generated_question_schema(pool)
    await _ensure_practice_history_schema(pool)
    await _backfill_answer_attempts_from_score_attempts(pool)
    await _ensure_static_function_schema(pool)
    await _seed_static_functions(pool)
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
                    WHERE NOT EXISTS (
                        SELECT 1
                        FROM answer existing
                        WHERE existing.migration_key = 'score_attempts:' || s.legacy_attempt_id::text
                    );

                    DROP TABLE IF EXISTS score_attempts CASCADE;
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


async def _ensure_static_function_schema(db_pool: asyncpg.Pool) -> None:
    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS static_function_patterns (
                pattern_slug VARCHAR(80) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                display_order INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS static_function_methods (
                pattern_slug VARCHAR(80) NOT NULL REFERENCES static_function_patterns(pattern_slug) ON DELETE CASCADE,
                method_slug VARCHAR(120) NOT NULL,
                name VARCHAR(255) NOT NULL,
                display_order INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (pattern_slug, method_slug)
            );

            CREATE TABLE IF NOT EXISTS static_functions (
                name VARCHAR(120) PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                difficulty VARCHAR(20) NOT NULL CHECK (difficulty IN ('Easy', 'Med.', 'Hard')),
                description TEXT NOT NULL DEFAULT '',
                code TEXT NOT NULL,
                tags TEXT[] DEFAULT '{}',
                leetcode_examples JSONB NOT NULL DEFAULT '[]'::jsonb,
                display_order INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS static_function_skill_map (
                function_name VARCHAR(120) NOT NULL REFERENCES static_functions(name) ON DELETE CASCADE,
                pattern_slug VARCHAR(80) NOT NULL REFERENCES static_function_patterns(pattern_slug) ON DELETE CASCADE,
                method_slug VARCHAR(120) NOT NULL,
                display_order INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (function_name, pattern_slug, method_slug)
            );

            CREATE INDEX IF NOT EXISTS idx_static_function_skill_map_pattern
                ON static_function_skill_map(pattern_slug, display_order);

            CREATE INDEX IF NOT EXISTS idx_static_functions_tags
                ON static_functions USING GIN(tags);
            """
        )


async def _seed_static_functions(db_pool: asyncpg.Pool) -> None:
    pattern_order: dict[str, int] = {}
    method_order: dict[tuple[str, str], int] = {}
    function_rows: list[tuple[str, dict, str, int]] = []
    mapping_rows: list[tuple[str, str, str, int]] = []

    for function_index, (function_name, meta) in enumerate(STATIC_FUNCTION_CATALOG.items(), 1):
        code = inspect.getsource(getattr(static_functions, function_name)).strip()
        function_rows.append((function_name, meta, code, function_index))
        for pattern_slug in meta["patterns"]:
            pattern_order.setdefault(pattern_slug, len(pattern_order) + 1)
            for method_slug in meta["methods"]:
                method_key = (pattern_slug, method_slug)
                method_order.setdefault(method_key, len(method_order) + 1)
                mapping_rows.append((function_name, pattern_slug, method_slug, function_index))

    async with db_pool.acquire() as conn:
        async with conn.transaction():
            for pattern_slug, display_order in pattern_order.items():
                await conn.execute(
                    """
                    INSERT INTO static_function_patterns (pattern_slug, name, display_order, updated_at)
                    VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                    ON CONFLICT (pattern_slug) DO UPDATE SET
                        name = EXCLUDED.name,
                        display_order = EXCLUDED.display_order,
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    pattern_slug,
                    _display_label(pattern_slug),
                    display_order,
                )

            for (pattern_slug, method_slug), display_order in method_order.items():
                await conn.execute(
                    """
                    INSERT INTO static_function_methods (pattern_slug, method_slug, name, display_order, updated_at)
                    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
                    ON CONFLICT (pattern_slug, method_slug) DO UPDATE SET
                        name = EXCLUDED.name,
                        display_order = EXCLUDED.display_order,
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    pattern_slug,
                    method_slug,
                    _display_label(method_slug).lower(),
                    display_order,
                )

            for function_name, meta, code, display_order in function_rows:
                await conn.execute(
                    """
                    INSERT INTO static_functions
                        (name, title, difficulty, description, code, tags, leetcode_examples, display_order, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, CURRENT_TIMESTAMP)
                    ON CONFLICT (name) DO UPDATE SET
                        title = EXCLUDED.title,
                        difficulty = EXCLUDED.difficulty,
                        description = EXCLUDED.description,
                        code = EXCLUDED.code,
                        tags = EXCLUDED.tags,
                        leetcode_examples = EXCLUDED.leetcode_examples,
                        display_order = EXCLUDED.display_order,
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    function_name,
                    meta["title"],
                    meta["difficulty"],
                    meta["description"],
                    code,
                    list(meta["tags"]),
                    json.dumps(list(meta["leetcodeExamples"])),
                    display_order,
                )

            await conn.execute("DELETE FROM static_function_skill_map")
            for function_name, pattern_slug, method_slug, display_order in mapping_rows:
                await conn.execute(
                    """
                    INSERT INTO static_function_skill_map
                        (function_name, pattern_slug, method_slug, display_order)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (function_name, pattern_slug, method_slug) DO UPDATE SET
                        display_order = EXCLUDED.display_order
                    """,
                    function_name,
                    pattern_slug,
                    method_slug,
                    display_order,
                )
