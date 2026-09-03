from __future__ import annotations

import asyncio
import json

import asyncpg
import pytest

from app.config import settings


async def _connect_db() -> asyncpg.Connection:
    return await asyncpg.connect(settings.database_url)


async def _seed_performance_fixture(conn: asyncpg.Connection) -> None:
    await conn.execute(
        """
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
        VALUES (
            'mcq-fx-perf-q',
            '0000',
            'Performance fixture question',
            '',
            NULL,
            'correct',
            'fx-perf-fingerprint-q',
            NOW(),
            NOW()
        )
        ON CONFLICT (id) DO NOTHING
        """
    )
    await conn.execute(
        """
        INSERT INTO submission (
            id,
            session_id,
            user_id,
            multiple_choice_problem_id,
            answer,
            question_type,
            category_tags,
            correct_answer,
            accuracy,
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
            920000 + s,
            'fx-perf-session-' || s::text,
            '0000',
            'mcq-fx-perf-q',
            'user-answer-' || s::text,
            CASE WHEN s % 10 = 0 THEN 'skill-map-lite' ELSE 'skill-map' END,
            ARRAY['skill-map', CASE WHEN s % 2 = 0 THEN 'two-pointers' ELSE 'binary-search' END],
            'correct',
            (s % 100)::float,
            jsonb_build_object(
                'elapsed_ms', 1000 + s,
                'coach_feedback', '{}'::jsonb,
                'submission_rubric', '{}'::jsonb
            ),
            'fx-perf-interaction-' || s::text,
            CASE WHEN s % 5 = 0 THEN 'fx-perf-card-target' ELSE 'fx-perf-card-' || (s % 17)::text END,
            jsonb_build_object('id', 'fx-perf-card-' || s::text, 'title', 'Perf Card ' || s::text),
            'algorithm',
            'none',
            FALSE,
            'fx-perf-migration-' || s::text,
            NOW() - ((s % 720)::text || ' minutes')::interval,
            NOW() - ((s % 720)::text || ' minutes')::interval
        FROM generate_series(1, 800) AS s
        ON CONFLICT (id) DO NOTHING
        """
    )
async def _cleanup_performance_fixture(conn: asyncpg.Connection) -> None:
    await conn.execute("DELETE FROM submission WHERE id BETWEEN 920001 AND 920800")
    await conn.execute("DELETE FROM multiple_choice_problem WHERE id = 'mcq-fx-perf-q'")


async def _fetch_index_names(conn: asyncpg.Connection, table_name: str) -> set[str]:
    rows = await conn.fetch(
        """
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = $1
        """,
        table_name,
    )
    return {str(row["indexname"]) for row in rows}


async def _explain_json(conn: asyncpg.Connection, sql: str, *args) -> dict:
    async with conn.transaction():
        await conn.execute("SET LOCAL enable_seqscan = off")
        row = await conn.fetchrow(f"EXPLAIN (FORMAT JSON) {sql}", *args)

    if not row:
        raise AssertionError("EXPLAIN returned no rows")

    payload = row[0]
    if isinstance(payload, str):
        parsed = json.loads(payload)
    else:
        parsed = payload

    if not isinstance(parsed, list) or not parsed or not isinstance(parsed[0], dict):
        raise AssertionError("Unexpected EXPLAIN JSON payload")
    return parsed[0]


def _collect_node_types(node: dict) -> list[str]:
    node_type = str(node.get("Node Type") or "")
    children = node.get("Plans") or []
    values = [node_type] if node_type else []
    for child in children:
        if isinstance(child, dict):
            values.extend(_collect_node_types(child))
    return values


def _collect_index_names(node: dict) -> list[str]:
    values: list[str] = []
    index_name = node.get("Index Name")
    if isinstance(index_name, str) and index_name:
        values.append(index_name)
    for child in node.get("Plans") or []:
        if isinstance(child, dict):
            values.extend(_collect_index_names(child))
    return values


@pytest.mark.integration
def test_performance_guard_required_indexes_exist() -> None:
    async def _run() -> None:
        conn = await _connect_db()
        try:
            submission_indexes = await _fetch_index_names(conn, "submission")
            assert "idx_submission_question_type_created_at" in submission_indexes
            assert "idx_submission_generated_card_id" in submission_indexes
            assert "idx_submission_category_tags" in submission_indexes
            assert "idx_submission_created_at" in submission_indexes
        finally:
            await conn.close()

    try:
        asyncio.run(_run())
    except (OSError, asyncpg.PostgresError) as exc:
        pytest.skip(f"Postgres not available for integration test: {exc}")


@pytest.mark.integration
def test_performance_guard_history_and_overview_queries_avoid_seq_scan() -> None:
    async def _run() -> None:
        conn = await _connect_db()
        try:
            await _seed_performance_fixture(conn)

            history_explain = await _explain_json(
                conn,
                """
                SELECT a.id
                FROM submission a
                WHERE a.question_type = $1
                  AND (COALESCE(a.generated_card_id, a.multiple_choice_problem_id) = $2 OR a.category_tags && $3::text[])
                ORDER BY a.created_at DESC
                LIMIT $4
                """,
                "skill-map",
                "fx-perf-card-target",
                ["binary-search"],
                25,
            )
            history_plan = history_explain["Plan"]
            history_nodes = _collect_node_types(history_plan)
            history_index_names = _collect_index_names(history_plan)

            assert "Seq Scan" not in history_nodes
            assert any("Index" in name or "idx_submission_" in name for name in history_index_names)

            overview_explain = await _explain_json(
                conn,
                """
                SELECT a.created_at
                FROM submission a
                WHERE a.question_type LIKE 'skill-map%'
                ORDER BY a.created_at DESC
                LIMIT 100
                """,
            )
            overview_plan = overview_explain["Plan"]
            overview_nodes = _collect_node_types(overview_plan)
            overview_index_names = _collect_index_names(overview_plan)

            assert "Limit" in overview_nodes
            assert "Seq Scan" not in overview_nodes
            assert any(name in {"idx_submission_question_type_created_at", "idx_submission_created_at"} for name in overview_index_names)
        finally:
            try:
                await _cleanup_performance_fixture(conn)
            finally:
                await conn.close()

    try:
        asyncio.run(_run())
    except (OSError, asyncpg.PostgresError) as exc:
        pytest.skip(f"Postgres not available for integration test: {exc}")
