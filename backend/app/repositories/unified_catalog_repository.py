from __future__ import annotations

import json
from typing import Any

from app.repositories.base import acquire_connection


async def fetch_static_playlist_drills(playlist_slug: str, order_slug: str) -> list[dict[str, Any]]:
    async with acquire_connection() as conn:
        rows = await conn.fetch(
            """
            SELECT p.slug AS id, p.question_type, p.title, p.difficulty,
                   p.prompt, p.code AS solution, p.missing, p.hint, p.tags,
                   p.generation_context AS metadata, ppo.metadata AS playlist_metadata
            FROM playlist_problem_order ppo
            JOIN problem p ON p.slug = ppo.problem_slug
            WHERE ppo.playlist_slug = $1 AND ppo.order_slug = $2
            ORDER BY ppo.position ASC
            """,
            playlist_slug,
            order_slug,
        )
    return [dict(row) for row in rows]


async def fetch_playlist_catalog_rows() -> list[dict[str, Any]]:
    async with acquire_connection() as conn:
        rows = await conn.fetch(
            """
            SELECT pl.slug, pl.title, pl.description, pl.show_on_skill_map,
                   pl.static_deck, p.slug AS id, p.title AS item_title,
                   ppo.metadata AS playlist_metadata
            FROM playlist pl
            JOIN playlist_problem_order ppo
              ON ppo.playlist_slug = pl.slug AND ppo.order_slug = 'curated'
            JOIN problem p ON p.slug = ppo.problem_slug
            ORDER BY pl.slug ASC, ppo.position ASC
            """
        )
    return [dict(row) for row in rows]


async def upsert_generated_problem(
    *, card_id: str, question_type: str, title: str, difficulty: str,
    prompt: str, solution: str, missing: str, hint: str, tags: list[str],
    llm_used: bool, generation_context_json: str,
) -> None:
    async with acquire_connection() as conn:
        await conn.execute(
            """
            INSERT INTO problem (
                slug, algorithm_slug, title, difficulty, description, code, tags,
                leetcode_examples, source_type, question_type, prompt, missing,
                hint, llm_used, generation_context, updated_at
            )
            VALUES (
                $1,
                COALESCE((SELECT slug FROM algorithm WHERE slug = ANY($9::text[]) LIMIT 1), 'meta'),
                $3, $4, $5, $6, $9, '[]'::jsonb, 'generated-llm', $2,
                $5, $7, $8, $10, $11::jsonb, NOW()
            )
            ON CONFLICT (slug) DO UPDATE SET
                algorithm_slug = EXCLUDED.algorithm_slug, title = EXCLUDED.title,
                difficulty = EXCLUDED.difficulty, description = EXCLUDED.description,
                code = EXCLUDED.code, tags = EXCLUDED.tags,
                source_type = EXCLUDED.source_type, question_type = EXCLUDED.question_type,
                prompt = EXCLUDED.prompt, missing = EXCLUDED.missing, hint = EXCLUDED.hint,
                llm_used = EXCLUDED.llm_used, generation_context = EXCLUDED.generation_context,
                updated_at = NOW()
            """,
            card_id, question_type, title, difficulty, prompt, solution,
            missing, hint, tags, llm_used, generation_context_json,
        )


async def seed_static_playlist(
    *, slug: str, title: str, description: str, show_on_skill_map: bool,
    items: list[dict[str, Any]], orderings: dict[str, list[str]],
) -> None:
    async with acquire_connection() as conn:
        async with conn.transaction():
            await conn.execute(
                """
                INSERT INTO playlist (slug, title, description, show_on_skill_map, static_deck, updated_at)
                VALUES ($1, $2, $3, $4, TRUE, NOW())
                ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title,
                    description = EXCLUDED.description,
                    show_on_skill_map = EXCLUDED.show_on_skill_map,
                    static_deck = TRUE, updated_at = NOW()
                """,
                slug, title, description, show_on_skill_map,
            )
            for item in items:
                metadata = dict(item.get("metadata", {}))
                metadata.update({
                    "templatePrompts": item.get("templatePrompts", {}),
                    "templateTargets": item.get("templateTargets", {}),
                    "plainEnglishPromptDetail": item.get("plainEnglishPromptDetail", {}),
                    "skeletonApplicability": item.get("skeletonApplicability"),
                })
                examples = metadata.get("plainEnglishPromptDetail", {}).get("leetcodeExamples", [])
                await conn.execute(
                    """
                    INSERT INTO problem (
                        slug, algorithm_slug, title, difficulty, description, code, tags,
                        leetcode_examples, source_type, question_type, prompt, missing,
                        hint, generation_context, updated_at
                    )
                    VALUES ($1, COALESCE((SELECT slug FROM algorithm WHERE slug = $2), 'meta'),
                            $3, $4, $5, $6, $7, $8::jsonb, 'static-playlist', $9,
                            $5, $10, $11, $12::jsonb, NOW())
                    ON CONFLICT (slug) DO UPDATE SET
                        algorithm_slug = EXCLUDED.algorithm_slug, title = EXCLUDED.title,
                        difficulty = EXCLUDED.difficulty, description = EXCLUDED.description,
                        code = EXCLUDED.code, tags = EXCLUDED.tags,
                        leetcode_examples = EXCLUDED.leetcode_examples,
                        source_type = EXCLUDED.source_type, question_type = EXCLUDED.question_type,
                        prompt = EXCLUDED.prompt, missing = EXCLUDED.missing, hint = EXCLUDED.hint,
                        generation_context = EXCLUDED.generation_context, updated_at = NOW()
                    """,
                    item["id"], item.get("family") or "meta", item["title"],
                    item["difficulty"], item["prompt"], item["solution"], item["tags"],
                    json.dumps(examples), item.get("questionType", "playlist:static"),
                    item["missing"], item["hint"], json.dumps(metadata),
                )

            await conn.execute("DELETE FROM playlist_problem_order WHERE playlist_slug = $1", slug)
            for order_slug, ordered_ids in orderings.items():
                for position, item_id in enumerate(ordered_ids):
                    item = next(item for item in items if str(item["id"]) == item_id)
                    await conn.execute(
                        """
                        INSERT INTO playlist_problem_order (
                            playlist_slug, order_slug, problem_slug, position, tier, family, metadata
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
                        """,
                        slug, order_slug, item_id, position, item.get("tier"),
                        item.get("family"), json.dumps(item.get("playlistMetadata", {})),
                    )
