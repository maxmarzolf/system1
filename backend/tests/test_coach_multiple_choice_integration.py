from __future__ import annotations

import asyncio
from uuid import uuid4

import asyncpg
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import create_app
from app.models import MultipleChoiceDrillsResponse
from app.services import drill_generation_service


QUESTION_SCHEMA_SQL = """
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
"""


async def _ensure_question_schema(database_url: str) -> None:
    conn = await asyncpg.connect(database_url)
    try:
        await conn.execute(QUESTION_SCHEMA_SQL)
    finally:
        await conn.close()


async def _fetch_question_row(database_url: str, question_id: str) -> asyncpg.Record | None:
    conn = await asyncpg.connect(database_url)
    try:
        return await conn.fetchrow(
            """
            SELECT
                id,
                user_id,
                question_text,
                multiple_choice_correct_answer_label,
                multiple_choice_correct_answer_text
            FROM question
            WHERE id = $1
            """,
            question_id,
        )
    finally:
        await conn.close()


async def _delete_question_row(database_url: str, question_id: str) -> None:
    conn = await asyncpg.connect(database_url)
    try:
        await conn.execute("DELETE FROM question WHERE id = $1", question_id)
    finally:
        await conn.close()


@pytest.mark.integration
def test_multiple_choice_route_persists_generated_question(monkeypatch: pytest.MonkeyPatch) -> None:
    try:
        asyncio.run(_ensure_question_schema(settings.database_url))
    except Exception as exc:  # pragma: no cover - environment-dependent integration guard
        pytest.skip(f"Postgres not available for integration test: {exc}")

    request_token = uuid4().hex[:10]
    question_id = f"itest-mcq-{request_token}"
    question_text = f"Which invariant prevents infinite loops in binary search? ({request_token})"
    question_payload = {
        "id": question_id,
        "title": "Binary Search Invariant",
        "pattern": "Binary Search",
        "difficulty": "Med.",
        "question": question_text,
        "choices": [
            {"id": "A", "text": "Use left <= right and tighten bounds each step."},
            {"id": "B", "text": "Always move both pointers together."},
            {"id": "C", "text": "Sort inside the loop before comparing."},
            {"id": "D", "text": "Reset pointers to zero after each midpoint."},
        ],
        "correctChoiceId": "A",
        "explanation": "Monotonic bounds updates guarantee termination.",
        "tags": ["skill-map", "skill-map-mcq", "binary-search"],
    }

    async def _stub_generate_multiple_choice_drills_response(
        _body,
        *,
        provider,
        provider_label,
        provider_available,
        call_llm_json,
        persist_generated_questions,
        logger,
    ) -> MultipleChoiceDrillsResponse:
        assert provider == "openai"
        assert provider_label
        assert provider_available is True
        assert call_llm_json is not None
        assert logger is not None
        await persist_generated_questions([question_payload])
        return MultipleChoiceDrillsResponse.model_validate({"drills": [question_payload], "llmUsed": True})

    monkeypatch.setattr(
        drill_generation_service,
        "_resolve_available_llm_provider",
        lambda _preferred_provider: "openai",
    )
    monkeypatch.setattr(
        drill_generation_service,
        "generate_multiple_choice_drills_response",
        _stub_generate_multiple_choice_drills_response,
    )

    app = create_app()
    with TestClient(app) as client:
        response = client.post(
            "/api/coach/multiple-choice-drills",
            json={
                "count": 1,
                "difficulty": "Med.",
                "llmProvider": "openai",
                "skillMap": [
                    {
                        "pattern": "binary-search",
                        "methods": ["left / right bounds"],
                    }
                ],
            },
        )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["llmUsed"] is True
    assert len(payload["drills"]) == 1
    assert payload["drills"][0]["id"] == question_id

    row = asyncio.run(_fetch_question_row(settings.database_url, question_id))
    try:
        assert row is not None
        assert row["id"] == question_id
        assert row["user_id"] == "0000"
        assert row["question_text"] == question_text
        assert row["multiple_choice_correct_answer_label"] == "A"
        assert row["multiple_choice_correct_answer_text"] == "Use left <= right and tighten bounds each step."
    finally:
        asyncio.run(_delete_question_row(settings.database_url, question_id))