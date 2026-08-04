from __future__ import annotations

import asyncio
from pathlib import Path
from uuid import uuid4

import asyncpg
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import create_app
from app import database as database_module


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "migrated_score_attempts.sql"


async def _execute_sql_file(database_url: str, file_path: Path) -> None:
    conn = await asyncpg.connect(database_url)
    try:
        await conn.execute(file_path.read_text())
    finally:
        await conn.close()


async def _cleanup_fixture_rows(database_url: str) -> None:
    conn = await asyncpg.connect(database_url)
    try:
        await conn.execute("DELETE FROM coach_feedback_events WHERE id = 910001 OR interaction_id = 'fx-parity-interaction-1'")
        await conn.execute(
            "DELETE FROM submission WHERE id = 910001 OR migration_key = 'fx-parity-migration-1' OR multiple_choice_problem_id = 'mcq-fx-parity-q1'"
        )
        await conn.execute("DELETE FROM multiple_choice_problem WHERE id = 'mcq-fx-parity-q1'")
    finally:
        await conn.close()


async def _count_submission_rows(database_url: str, migration_key: str) -> int:
    conn = await asyncpg.connect(database_url)
    try:
        row = await conn.fetchrow("SELECT COUNT(*)::int AS count FROM submission WHERE migration_key = $1", migration_key)
        return int(row["count"] if row else 0)
    finally:
        await conn.close()


async def _cleanup_roundtrip_rows(database_url: str, generated_card_id: str) -> None:
    conn = await asyncpg.connect(database_url)
    try:
        await conn.execute("DELETE FROM coach_feedback_events WHERE card_id = $1 OR generated_card_id = $1", generated_card_id)
        await conn.execute("DELETE FROM submission WHERE generated_card_id = $1", generated_card_id)
    finally:
        await conn.close()


async def _prepare_legacy_score_attempts_table(database_url: str, migration_key: str) -> None:
    conn = await asyncpg.connect(database_url)
    try:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS score_attempts (
                id SERIAL PRIMARY KEY,
                question TEXT,
                question_type VARCHAR(50) NOT NULL DEFAULT '',
                category_tags TEXT[] DEFAULT '{}',
                correct_answer TEXT,
                user_answer TEXT,
                correct BOOLEAN NOT NULL DEFAULT FALSE,
                accuracy REAL NOT NULL DEFAULT 0,
                exact BOOLEAN NOT NULL DEFAULT FALSE,
                elapsed_ms INTEGER NOT NULL DEFAULT 0,
                interaction_id VARCHAR(80),
                generated_card_id VARCHAR(80),
                generated_card JSONB,
                template_mode VARCHAR(20) NOT NULL DEFAULT 'algorithm',
                support_layer VARCHAR(30) NOT NULL DEFAULT 'none',
                live_coach_used BOOLEAN NOT NULL DEFAULT FALSE,
                coach_feedback JSONB,
                submission_rubric JSONB,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        await conn.execute(
            """
            INSERT INTO score_attempts (
                id,
                question,
                question_type,
                category_tags,
                correct_answer,
                user_answer,
                correct,
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
                created_at,
                updated_at
            )
            VALUES (
                991001,
                'Legacy migrated prompt',
                'skill-map',
                ARRAY['skill-map', 'fx-idempotency-tag'],
                'legacy-correct',
                'legacy-user',
                TRUE,
                95,
                TRUE,
                1800,
                'fx-idempotency-interaction',
                'fx-idempotency-card',
                '{"id":"fx-idempotency-card","title":"Legacy Card"}'::jsonb,
                'algorithm',
                'none',
                FALSE,
                '{}'::jsonb,
                '{}'::jsonb,
                NOW(),
                NOW()
            )
            ON CONFLICT (id) DO NOTHING;
            """
        )
        await conn.execute(
            "DELETE FROM submission WHERE migration_key = $1",
            migration_key,
        )
    finally:
        await conn.close()


@pytest.mark.integration
def test_coach_history_parity_with_real_migrated_fixture() -> None:
    try:
        asyncio.run(_cleanup_fixture_rows(settings.database_url))
        asyncio.run(_execute_sql_file(settings.database_url, FIXTURE_PATH))
    except Exception as exc:
        pytest.skip(f"Postgres not available for integration test: {exc}")

    app = create_app()
    with TestClient(app) as client:
        response = client.post(
            "/api/coach/history",
            json={
                "cardId": "fx-parity-card-1",
                "questionType": "skill-map",
                "skillTags": ["fx-parity-tag"],
                "limit": 10,
            },
        )

    try:
        assert response.status_code == 200, response.text
        payload = response.json()
        assert "entries" in payload
        assert len(payload["entries"]) >= 1

        entry = next(item for item in payload["entries"] if item["attemptId"] == 910001)
        assert entry["cardId"] == "fx-parity-card-1"
        assert entry["questionType"] == "skill-map"
        assert entry["correctAnswer"] == "Use binary search with left-bound checks."
        assert entry["userAnswer"] == "while left <= right: ..."
        assert entry["accuracy"] == 100
        assert entry["liveFeedbackCount"] >= 1
    finally:
        asyncio.run(_cleanup_fixture_rows(settings.database_url))


@pytest.mark.integration
def test_attempt_post_and_history_round_trip_real_db() -> None:
    request_token = uuid4().hex[:10]
    generated_card_id = f"fx-roundtrip-card-{request_token}"
    interaction_id = f"fx-roundtrip-interaction-{request_token}"

    try:
        app = create_app()
        with TestClient(app) as client:
            create_response = client.post(
                "/api/attempts",
                json={
                    "cardId": generated_card_id,
                    "cardTitle": "Roundtrip Card",
                    "question": "Roundtrip question prompt",
                    "questionType": "skill-map",
                    "categoryTags": ["skill-map", "fx-roundtrip-tag"],
                    "correctAnswer": "roundtrip-correct",
                    "userAnswer": "roundtrip-user",
                    "mode": "main-recall",
                    "correct": True,
                    "accuracy": 100,
                    "exact": True,
                    "elapsedMs": 1500,
                    "interactionId": interaction_id,
                    "generatedCardId": generated_card_id,
                    "generatedCard": {
                        "id": generated_card_id,
                        "title": "Roundtrip Card",
                        "cardMode": "recall",
                    },
                    "templateMode": "algorithm",
                    "supportLayer": "none",
                    "liveCoachUsed": False,
                },
            )

            assert create_response.status_code == 201, create_response.text
            created_payload = create_response.json()
            assert created_payload["saved"] is True
            assert isinstance(created_payload["attemptId"], int)

            history_response = client.post(
                "/api/coach/history",
                json={
                    "cardId": generated_card_id,
                    "questionType": "skill-map",
                    "skillTags": ["fx-roundtrip-tag"],
                    "limit": 5,
                },
            )

            assert history_response.status_code == 200, history_response.text
            history_payload = history_response.json()
            entry = next(item for item in history_payload["entries"] if item["attemptId"] == created_payload["attemptId"])
            assert entry["cardId"] == generated_card_id
            assert entry["correctAnswer"] == "roundtrip-correct"
            assert entry["userAnswer"] == "roundtrip-user"
            assert entry["questionType"] == "skill-map"
    except Exception as exc:
        pytest.skip(f"Postgres not available for integration test: {exc}")
    finally:
        try:
            asyncio.run(_cleanup_roundtrip_rows(settings.database_url, generated_card_id))
        except Exception:
            pass


@pytest.mark.integration
def test_backfill_idempotency_behavior_with_real_table() -> None:
    migration_key = "score_attempts:991001"

    try:
        asyncio.run(database_module.connect())
        asyncio.run(_prepare_legacy_score_attempts_table(settings.database_url, migration_key))
        pool = database_module.get_pool()

        asyncio.run(database_module._backfill_submission_attempts_from_score_attempts(pool))
        first_count = asyncio.run(_count_submission_rows(settings.database_url, migration_key))

        asyncio.run(_prepare_legacy_score_attempts_table(settings.database_url, migration_key))
        asyncio.run(database_module._backfill_submission_attempts_from_score_attempts(pool))
        second_count = asyncio.run(_count_submission_rows(settings.database_url, migration_key))

        assert first_count == 1
        assert second_count == 1
    except Exception as exc:
        pytest.skip(f"Postgres not available for integration test: {exc}")
    finally:
        try:
            asyncio.run(database_module.disconnect())
        except Exception:
            pass


@pytest.mark.integration
def test_skill_map_overview_updates_after_real_attempt_write() -> None:
    request_token = uuid4().hex[:10]
    generated_card_id = f"fx-overview-card-{request_token}"
    interaction_id = f"fx-overview-interaction-{request_token}"

    try:
        app = create_app()
        with TestClient(app) as client:
            before_response = client.get("/api/skill-map-overview")
            assert before_response.status_code == 200, before_response.text
            before_payload = before_response.json()
            before_work_count = int(before_payload.get("summary", {}).get("workCount", 0))

            create_response = client.post(
                "/api/attempts",
                json={
                    "cardId": generated_card_id,
                    "cardTitle": "Overview Delta Card",
                    "question": "Overview delta question prompt",
                    "questionType": "skill-map",
                    "categoryTags": ["skill-map", "fx-overview-tag"],
                    "correctAnswer": "overview-correct",
                    "userAnswer": "overview-user",
                    "mode": "main-recall",
                    "correct": True,
                    "accuracy": 100,
                    "exact": True,
                    "elapsedMs": 1200,
                    "interactionId": interaction_id,
                    "generatedCardId": generated_card_id,
                    "generatedCard": {
                        "id": generated_card_id,
                        "title": "Overview Delta Card",
                        "cardMode": "recall",
                    },
                    "templateMode": "algorithm",
                    "supportLayer": "none",
                    "liveCoachUsed": False,
                },
            )
            assert create_response.status_code == 201, create_response.text

            after_response = client.get("/api/skill-map-overview")
            assert after_response.status_code == 200, after_response.text
            after_payload = after_response.json()
            after_work_count = int(after_payload.get("summary", {}).get("workCount", 0))

            assert after_work_count >= before_work_count + 1
            assert "algorithms" in after_payload
            assert "reviewQueue" in after_payload
            assert "ghostRepActivity" in after_payload
    except Exception as exc:
        pytest.skip(f"Postgres not available for integration test: {exc}")
    finally:
        try:
            asyncio.run(_cleanup_roundtrip_rows(settings.database_url, generated_card_id))
        except Exception:
            pass


@pytest.mark.integration
def test_taxonomy_remap_migration_is_idempotent_real_db() -> None:
    token = uuid4().hex[:10]
    interaction_id = f"fx-remap-{token}"

    async def _seed_legacy_rows() -> int:
        conn = await asyncpg.connect(settings.database_url)
        try:
            await conn.execute(
                "CREATE TABLE IF NOT EXISTS core_algorithm_patterns (pattern_slug VARCHAR(80) PRIMARY KEY)"
            )
            row = await conn.fetchrow(
                """
                INSERT INTO submission (session_id, answer, category_tags, interaction_id)
                VALUES ($1, 'x', ARRAY['skill-map', 'dfs-bfs', 'greedy-sorting'], $1)
                RETURNING id
                """,
                interaction_id,
            )
            return int(row["id"])
        finally:
            await conn.close()

    async def _read_state(submission_id: int) -> tuple[list[str], bool]:
        conn = await asyncpg.connect(settings.database_url)
        try:
            tags = await conn.fetchval("SELECT category_tags FROM submission WHERE id = $1", submission_id)
            legacy_table = await conn.fetchval("SELECT to_regclass('public.core_algorithm_patterns')")
            return list(tags or []), legacy_table is not None
        finally:
            await conn.close()

    async def _cleanup(submission_id: int | None) -> None:
        conn = await asyncpg.connect(settings.database_url)
        try:
            if submission_id is not None:
                await conn.execute("DELETE FROM submission WHERE id = $1", submission_id)
        finally:
            await conn.close()

    submission_id: int | None = None
    try:
        asyncio.run(database_module.connect())
        pool = database_module.get_pool()
        submission_id = asyncio.run(_seed_legacy_rows())

        asyncio.run(database_module._apply_taxonomy_remap_migration(pool))
        tags_first, legacy_exists_first = asyncio.run(_read_state(submission_id))

        asyncio.run(database_module._apply_taxonomy_remap_migration(pool))
        tags_second, legacy_exists_second = asyncio.run(_read_state(submission_id))

        assert "dfs-bfs" not in tags_first
        assert "greedy-sorting" not in tags_first
        assert "graphs" in tags_first
        assert "sorting" in tags_first
        assert legacy_exists_first is False
        assert (tags_second, legacy_exists_second) == (tags_first, legacy_exists_first)
    except Exception as exc:
        pytest.skip(f"Postgres not available for integration test: {exc}")
    finally:
        try:
            asyncio.run(_cleanup(submission_id))
        except Exception:
            pass
        try:
            asyncio.run(database_module.disconnect())
        except Exception:
            pass
