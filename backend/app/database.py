from __future__ import annotations

import inspect
import json
from pathlib import Path

import asyncpg

from app.config import settings
from app.core import core_algorithms, core_meta
from app.core.core_algorithm_catalog import CORE_ALGORITHM_CATALOG, CORE_META_CATALOG
from app.core.signal_catalog import DEFAULT_SIGNAL_SPEC, get_signal_spec, spec_to_json
from app.core.taxonomy_catalog import ALGORITHMS, CANONICAL_SKILLS, TECHNIQUES

SCHEMA_PATH = Path(__file__).with_name("schema.sql")

pool: asyncpg.Pool | None = None


async def connect() -> asyncpg.Pool:
    global pool
    pool = await asyncpg.create_pool(settings.database_url)
    await _ensure_schema(pool)
    await _apply_schema_upgrades(pool)
    await _seed_taxonomy(pool)
    from app.services.unified_catalog_service import seed_canonical_catalog

    await seed_canonical_catalog()
    return pool


async def disconnect() -> None:
    global pool
    if pool:
        await pool.close()
        pool = None


def get_pool() -> asyncpg.Pool:
    assert pool is not None, "Database pool not initialised – call connect() first"
    return pool


async def _ensure_schema(db_pool: asyncpg.Pool) -> None:
    async with db_pool.acquire() as conn:
        await conn.execute(SCHEMA_PATH.read_text(encoding="utf-8"))


async def _apply_schema_upgrades(db_pool: asyncpg.Pool) -> None:
    """In-place upgrades for databases created before the current schema.sql.
    Every statement is idempotent."""
    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            ALTER TABLE algorithm
                ADD COLUMN IF NOT EXISTS signal_spec JSONB NOT NULL DEFAULT '{}'::jsonb;

            DROP INDEX IF EXISTS idx_submission_migration_key;
            ALTER TABLE submission DROP COLUMN IF EXISTS migration_key;
            """
        )
        await conn.execute(
            """
            UPDATE submission
            SET signals = jsonb_set(signals, '{evaluation,signalSpec}', $1::jsonb)
            WHERE signals ? 'evaluation'
              AND NOT (signals->'evaluation' ? 'signalSpec')
            """,
            json.dumps({**DEFAULT_SIGNAL_SPEC.reference(), "version": 0}),
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
                    INSERT INTO algorithm (slug, name, display_order, signal_spec, updated_at)
                    VALUES ($1, $2, $3, $4::jsonb, NOW())
                    ON CONFLICT (slug) DO UPDATE SET
                        name = EXCLUDED.name,
                        display_order = EXCLUDED.display_order,
                        signal_spec = EXCLUDED.signal_spec,
                        updated_at = NOW()
                    """,
                    algorithm_slug,
                    algorithm_name,
                    display_order,
                    json.dumps(spec_to_json(get_signal_spec(algorithm_slug))),
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
                         tags, leetcode_examples, source_type, question_type, prompt,
                         missing, hint, display_order, updated_at)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb,
                            $10, 'skill-map', $5,
                            CASE WHEN $10::varchar = 'core-meta' THEN '# core meta complete' ELSE '# core algorithm complete' END,
                            COALESCE(NULLIF($5, ''), 'Recall the reusable algorithm shape.'), $9, NOW())
                    ON CONFLICT (slug) DO UPDATE SET
                        algorithm_slug = EXCLUDED.algorithm_slug,
                        title = EXCLUDED.title,
                        difficulty = EXCLUDED.difficulty,
                        description = EXCLUDED.description,
                        code = EXCLUDED.code,
                        tags = EXCLUDED.tags,
                        leetcode_examples = EXCLUDED.leetcode_examples,
                        source_type = EXCLUDED.source_type,
                        question_type = EXCLUDED.question_type,
                        prompt = EXCLUDED.prompt,
                        missing = EXCLUDED.missing,
                        hint = EXCLUDED.hint,
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
                    "core-meta" if "core-meta" in meta["tags"] else "core-catalog",
                )

            await conn.execute(
                "DELETE FROM problem WHERE source_type IN ('core-catalog', 'core-meta') AND slug <> ALL($1::text[])",
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

            await conn.execute(
                "DELETE FROM skill WHERE slug <> ALL($1::text[])",
                list(skill_order),
            )
