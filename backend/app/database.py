from __future__ import annotations

import hashlib
import inspect
import json
import logging
from typing import Any

import asyncpg

from app.config import settings
from app.core import core_algorithms, core_meta
from app.core.core_algorithm_catalog import CORE_ALGORITHM_CATALOG, CORE_META_CATALOG
from app.core.signal_catalog import get_signal_spec, spec_to_json
from app.core.taxonomy_catalog import ALGORITHMS, CANONICAL_SKILLS, TECHNIQUES
from app.db import close_pool, get_pool, open_pool  # noqa: F401 - get_pool re-exported for callers
from app.migrations.runner import upgrade_to_head
from app.repositories import unified_catalog_repository
from app.services import unified_catalog_service
from app.services.signal_registry_service import seed_signal_definitions

logger = logging.getLogger(__name__)

# Session advisory lock held for migrate + seed, so concurrent boots run them one at a time.
BOOT_LOCK_KEY = 0x5157_5345  # "SYSE"
CATALOG_SEED_KEY = "catalog"

async def connect() -> asyncpg.Pool:
    """Open the pool, then migrate and seed under an advisory lock."""
    pool = await open_pool(settings.database_url)
    async with pool.acquire() as lock_conn:
        await lock_conn.execute("SELECT pg_advisory_lock($1)", BOOT_LOCK_KEY)
        try:
            await upgrade_to_head(settings.database_url)
            await _seed_catalog(pool)
            await seed_signal_definitions()
        finally:
            await lock_conn.execute("SELECT pg_advisory_unlock($1)", BOOT_LOCK_KEY)
    return pool


async def disconnect() -> None:
    await close_pool()


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


async def _seed_catalog(db_pool: asyncpg.Pool) -> None:
    """Write the code catalogs (taxonomy, core problems, static playlists) when they changed.

    The hash covers the catalog data and the seeding code itself, so an
    unchanged boot reads one row and writes nothing. Delete the ``seed_state``
    row to force a reseed.
    """

    taxonomy = _taxonomy_rows()
    playlists = unified_catalog_service.build_static_playlist_seeds()
    digest = _catalog_hash(
        taxonomy,
        playlists,
        inspect.getsource(_write_taxonomy),
        inspect.getsource(unified_catalog_service),
        inspect.getsource(unified_catalog_repository.seed_static_playlist),
    )
    async with db_pool.acquire() as conn:
        stored = await conn.fetchval("SELECT hash FROM seed_state WHERE key = $1", CATALOG_SEED_KEY)
    if stored == digest:
        logger.info("Catalog seed unchanged (%s); skipping", digest[:12])
        return

    await _seed_taxonomy(db_pool, taxonomy)
    await unified_catalog_service.seed_canonical_catalog(playlists)
    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO seed_state (key, hash, updated_at) VALUES ($1, $2, NOW())
            ON CONFLICT (key) DO UPDATE SET hash = EXCLUDED.hash, updated_at = NOW()
            """,
            CATALOG_SEED_KEY,
            digest,
        )
    logger.info("Catalog seeded (%s)", digest[:12])


def _catalog_hash(*parts: Any) -> str:
    payload = json.dumps(parts, sort_keys=True, default=_json_default, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _json_default(value: Any) -> Any:
    if isinstance(value, (set, frozenset)):
        return sorted(value, key=str)
    return str(value)


def _taxonomy_rows() -> dict[str, list[tuple[Any, ...]]]:
    """Rows for algorithm, technique, skill, problem, problem_skill and problem_technique."""
    skill_order: dict[str, int] = {slug: index + 1 for index, slug in enumerate(CANONICAL_SKILLS)}
    problem_rows: list[tuple[Any, ...]] = []
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
            problem_rows.append(
                (
                    problem_slug,
                    meta["algorithm"],
                    meta["title"],
                    meta["difficulty"],
                    meta["description"],
                    code,
                    list(meta["tags"]),
                    json.dumps(list(meta["leetcodeExamples"])),
                    problem_index,
                    "core-meta" if "core-meta" in meta["tags"] else "core-catalog",
                )
            )
            for skill_slug in meta["skills"]:
                skill_order.setdefault(skill_slug, len(skill_order) + 1)
                problem_skill_rows.append((problem_slug, skill_slug, problem_index))
            for technique_slug in meta["techniques"]:
                problem_technique_rows.append((problem_slug, technique_slug, problem_index))

    return {
        "algorithm": [
            (slug, name, order, json.dumps(spec_to_json(get_signal_spec(slug))))
            for order, (slug, name) in enumerate(ALGORITHMS.items(), start=1)
        ],
        "technique": [(slug, name, order) for order, (slug, name) in enumerate(TECHNIQUES.items(), start=1)],
        "skill": [(slug, _display_label(slug).lower(), order) for slug, order in skill_order.items()],
        "problem": problem_rows,
        "problem_skill": problem_skill_rows,
        "problem_technique": problem_technique_rows,
    }


async def _seed_taxonomy(db_pool: asyncpg.Pool, rows: dict[str, list[tuple[Any, ...]]] | None = None) -> None:
    rows = rows if rows is not None else _taxonomy_rows()
    async with db_pool.acquire() as conn:
        async with conn.transaction():
            await _write_taxonomy(conn, rows)


async def _write_taxonomy(conn: asyncpg.Connection, rows: dict[str, list[tuple[Any, ...]]]) -> None:
    await conn.executemany(
        """
        INSERT INTO algorithm (slug, name, display_order, signal_spec, updated_at)
        VALUES ($1, $2, $3, $4::jsonb, NOW())
        ON CONFLICT (slug) DO UPDATE SET
            name = EXCLUDED.name,
            display_order = EXCLUDED.display_order,
            signal_spec = EXCLUDED.signal_spec,
            updated_at = NOW()
        """,
        rows["algorithm"],
    )
    await conn.executemany(
        """
        INSERT INTO technique (slug, name, display_order, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (slug) DO UPDATE SET
            name = EXCLUDED.name,
            display_order = EXCLUDED.display_order,
            updated_at = NOW()
        """,
        rows["technique"],
    )
    await conn.executemany(
        """
        INSERT INTO skill (slug, name, display_order, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (slug) DO UPDATE SET
            name = EXCLUDED.name,
            display_order = EXCLUDED.display_order,
            updated_at = NOW()
        """,
        rows["skill"],
    )
    await conn.executemany(
        """
        INSERT INTO problem
            (slug, algorithm_slug, title, difficulty, description, code,
             tags, leetcode_examples, source_type, question_type,
             missing, hint, display_order, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb,
                $10, 'skill-map',
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
            missing = EXCLUDED.missing,
            hint = EXCLUDED.hint,
            display_order = EXCLUDED.display_order,
            updated_at = NOW()
        """,
        rows["problem"],
    )

    # Core problems dropped from the code catalog. A problem with submissions is
    # kept (submission.problem_slug is ON DELETE RESTRICT) rather than aborting boot.
    current_slugs = [row[0] for row in rows["problem"]]
    await conn.execute(
        """
        DELETE FROM problem p
        WHERE p.source_type IN ('core-catalog', 'core-meta')
          AND p.slug <> ALL($1::text[])
          AND NOT EXISTS (SELECT 1 FROM submission s WHERE s.problem_slug = p.slug)
        """,
        current_slugs,
    )
    kept = await conn.fetch(
        "SELECT slug FROM problem WHERE source_type IN ('core-catalog', 'core-meta') AND slug <> ALL($1::text[])",
        current_slugs,
    )
    if kept:
        logger.warning(
            "Kept %d retired core problem(s) that still have submissions: %s",
            len(kept),
            ", ".join(row["slug"] for row in kept),
        )

    await conn.execute("DELETE FROM problem_skill")
    await conn.executemany(
        "INSERT INTO problem_skill (problem_slug, skill_slug, display_order) VALUES ($1, $2, $3)",
        _dedupe_pairs(rows["problem_skill"]),
    )
    await conn.execute("DELETE FROM problem_technique")
    await conn.executemany(
        "INSERT INTO problem_technique (problem_slug, technique_slug, display_order) VALUES ($1, $2, $3)",
        _dedupe_pairs(rows["problem_technique"]),
    )

    await conn.execute(
        "DELETE FROM skill WHERE slug <> ALL($1::text[])",
        [row[0] for row in rows["skill"]],
    )


def _dedupe_pairs(rows: list[tuple[str, str, int]]) -> list[tuple[str, str, int]]:
    """Last write wins per (problem, other) pair, like the old ON CONFLICT DO UPDATE."""
    return list({(row[0], row[1]): row for row in rows}.values())
