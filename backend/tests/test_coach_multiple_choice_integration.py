from __future__ import annotations

import asyncio
import json
from uuid import uuid4

import asyncpg
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import create_app
from app.models import MultipleChoiceDrillsResponse
from app.services import drill_generation_service


async def _ensure_database(database_url: str) -> None:
    conn = await asyncpg.connect(database_url)
    await conn.close()


async def _fetch_question_row(database_url: str, question_id: str) -> asyncpg.Record | None:
    conn = await asyncpg.connect(database_url)
    try:
        return await conn.fetchrow(
            """
            SELECT id, question_text, explanation, choices, correct_choice_id, algorithm_slug, created_at
            FROM multiple_choice_problem
            WHERE id = $1
            """,
            question_id,
        )
    finally:
        await conn.close()


async def _delete_question_row(database_url: str, question_id: str) -> None:
    conn = await asyncpg.connect(database_url)
    try:
        await conn.execute("DELETE FROM multiple_choice_problem WHERE id = $1", question_id)
    finally:
        await conn.close()


@pytest.mark.integration
def test_multiple_choice_route_persists_generated_question(monkeypatch: pytest.MonkeyPatch) -> None:
    try:
        asyncio.run(_ensure_database(settings.database_url))
    except Exception as exc:  # pragma: no cover - environment-dependent integration guard
        pytest.skip(f"Postgres not available for integration test: {exc}")

    request_token = uuid4().hex[:10]
    question_id = f"mcq-itest-{request_token}"
    question_text = f"Which invariant prevents infinite loops in binary search? ({request_token})"
    question_payload = {
        "id": question_id,
        "title": "Binary Search Invariant",
        "algorithm": "Binary Search",
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
        fallback_providers,
        provider_timeout_seconds,
        persist_generated_questions,
        logger,
    ) -> MultipleChoiceDrillsResponse:
        assert provider == "openai"
        assert provider_label
        assert isinstance(provider_available, bool)
        assert call_llm_json is not None
        assert fallback_providers
        assert provider_timeout_seconds > 0
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
        "_llm_provider_available",
        lambda _provider: True,
    )
    monkeypatch.setattr(settings, "coach_openai_api_key", "test-key")
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
                        "algorithm": "binary-search",
                        "skills": ["left / right bounds"],
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
        assert row["question_text"] == question_text
        assert row["explanation"] == "Monotonic bounds updates guarantee termination."
        assert json.loads(row["choices"]) == question_payload["choices"]
        assert row["correct_choice_id"] == "A"
        assert row["algorithm_slug"] == "binary-search"
        assert row["created_at"].tzinfo is not None
    finally:
        asyncio.run(_delete_question_row(settings.database_url, question_id))
