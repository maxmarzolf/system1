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
        VALUES (
            'fx-perf-q',
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
        INSERT INTO answer (
            id,
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
            920000 + s,
            'fx-perf-session-' || s::text,
            '0000',
            'fx-perf-q',
            'user-answer-' || s::text,
            CASE WHEN s % 10 = 0 THEN 'skill-map-lite' ELSE 'skill-map' END,
            ARRAY['skill-map', CASE WHEN s % 2 = 0 THEN 'two-pointers' ELSE 'binary-search' END],
            'correct',
            (s % 3 = 0),
            (s % 100)::float,
            (s % 3 = 0),
            1000 + s,
            'fx-perf-interaction-' || s::text,
            CASE WHEN s % 5 = 0 THEN 'fx-perf-card-target' ELSE 'fx-perf-card-' || (s % 17)::text END,
            jsonb_build_object('id', 'fx-perf-card-' || s::text, 'title', 'Perf Card ' || s::text),
            'algorithm',
            'none',
            FALSE,
            '{}'::jsonb,
            '{}'::jsonb,
            'fx-perf-migration-' || s::text,
            NOW() - ((s % 720)::text || ' minutes')::interval,
            NOW() - ((s % 720)::text || ' minutes')::interval
        FROM generate_series(1, 800) AS s
        ON CONFLICT (id) DO NOTHING
        """
    )
    await conn.execute(
        """
        INSERT INTO coach_feedback_events (
            id,
            interaction_id,
            card_id,
            answer_id,
            generated_card_id,
            question_type,
            feedback_stage,
            live_mode,
            prompt,
            expected_answer,
            user_answer,
            accuracy,
            exact,
            elapsed_ms,
            skill_tags,
            previous_attempts,
            live_milestones,
            feedback,
            llm_used,
            created_at
        )
        SELECT
            930000 + s,
            'fx-perf-interaction-' || (s * 2)::text,
            CASE WHEN s % 5 = 0 THEN 'fx-perf-card-target' ELSE 'fx-perf-card-' || ((s * 2) % 17)::text END,
            920000 + (s * 2),
            CASE WHEN s % 5 = 0 THEN 'fx-perf-card-target' ELSE 'fx-perf-card-' || ((s * 2) % 17)::text END,
            'skill-map',
            'live',
            TRUE,
            'perf prompt',
            'perf expected',
            'perf user',
            85,
            FALSE,
            1500,
            ARRAY['skill-map', 'binary-search'],
            '[]'::jsonb,
            '{}'::jsonb,
            '{"focus":"perf"}'::jsonb,
            FALSE,
            NOW() - ((s % 360)::text || ' minutes')::interval
        FROM generate_series(1, 300) AS s
        ON CONFLICT (id) DO NOTHING
        """
    )


async def _cleanup_performance_fixture(conn: asyncpg.Connection) -> None:
    await conn.execute("DELETE FROM coach_feedback_events WHERE id BETWEEN 930001 AND 930300")
    await conn.execute("DELETE FROM answer WHERE id BETWEEN 920001 AND 920800")
    await conn.execute("DELETE FROM question WHERE id = 'fx-perf-q'")


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
    try:
        conn = asyncio.run(_connect_db())
    except Exception as exc:
        pytest.skip(f"Postgres not available for integration test: {exc}")
        return

    try:
        answer_indexes = asyncio.run(_fetch_index_names(conn, "answer"))
        feedback_indexes = asyncio.run(_fetch_index_names(conn, "coach_feedback_events"))

        assert "idx_answer_question_type_created_at" in answer_indexes
        assert "idx_answer_generated_card_id" in answer_indexes
        assert "idx_answer_category_tags" in answer_indexes
        assert "idx_answer_created_at" in answer_indexes
        assert "idx_coach_feedback_events_answer_id" in feedback_indexes
        assert "idx_coach_feedback_events_stage_created" in feedback_indexes
    finally:
        asyncio.run(conn.close())


@pytest.mark.integration
def test_performance_guard_history_and_overview_queries_avoid_seq_scan() -> None:
    try:
        conn = asyncio.run(_connect_db())
    except Exception as exc:
        pytest.skip(f"Postgres not available for integration test: {exc}")
        return

    try:
        asyncio.run(_seed_performance_fixture(conn))

        history_explain = asyncio.run(
            _explain_json(
                conn,
                """
                SELECT a.id
                FROM answer a
                WHERE a.question_type = $1
                  AND (COALESCE(a.generated_card_id, a.question_id) = $2 OR a.category_tags && $3::text[])
                ORDER BY a.created_at DESC
                LIMIT $4
                """,
                "skill-map",
                "fx-perf-card-target",
                ["binary-search"],
                25,
            )
        )
        history_plan = history_explain["Plan"]
        history_nodes = _collect_node_types(history_plan)
        history_index_names = _collect_index_names(history_plan)

        assert "Seq Scan" not in history_nodes
        assert any("Index" in name or "idx_answer_" in name for name in history_index_names)

        overview_explain = asyncio.run(
            _explain_json(
                conn,
                """
                SELECT a.created_at
                FROM answer a
                WHERE a.question_type LIKE 'skill-map%'
                ORDER BY a.created_at DESC
                LIMIT 100
                """,
            )
        )
        overview_plan = overview_explain["Plan"]
        overview_nodes = _collect_node_types(overview_plan)
        overview_index_names = _collect_index_names(overview_plan)

        assert "Limit" in overview_nodes
        assert "Seq Scan" not in overview_nodes
        assert any(name in {"idx_answer_question_type_created_at", "idx_answer_created_at"} for name in overview_index_names)
    finally:
        try:
            asyncio.run(_cleanup_performance_fixture(conn))
        finally:
            asyncio.run(conn.close())


@pytest.mark.integration
def test_performance_guard_latest_feedback_query_uses_index_path() -> None:
    try:
        conn = asyncio.run(_connect_db())
    except Exception as exc:
        pytest.skip(f"Postgres not available for integration test: {exc}")
        return

    try:
        asyncio.run(_seed_performance_fixture(conn))

        explain = asyncio.run(
            _explain_json(
                conn,
                """
                SELECT fe.feedback
                FROM coach_feedback_events fe
                WHERE fe.feedback_stage = 'live'
                  AND fe.answer_id = $1
                ORDER BY fe.created_at DESC
                LIMIT 1
                """,
                920100,
            )
        )
        plan = explain["Plan"]
        node_types = _collect_node_types(plan)
        index_names = _collect_index_names(plan)

        assert "Seq Scan" not in node_types
        assert any(
            name in {"idx_coach_feedback_events_answer_id", "idx_coach_feedback_events_stage_created"}
            for name in index_names
        )
    finally:
        try:
            asyncio.run(_cleanup_performance_fixture(conn))
        finally:
            asyncio.run(conn.close())
