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

            UPDATE score_attempts
            SET template_mode = 'algorithm'
            WHERE template_mode IN ('pseudo', 'invariant', 'total');

            ALTER TABLE score_attempts
            ADD CONSTRAINT score_attempts_template_mode_check
            CHECK (template_mode IN ('algorithm'));

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

            CREATE INDEX IF NOT EXISTS idx_answer_question_id
                ON answer(question_id);

            CREATE INDEX IF NOT EXISTS idx_answer_session_user
                ON answer(session_id, user_id);
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
