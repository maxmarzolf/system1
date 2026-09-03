from __future__ import annotations

import pytest

from app.models import CoachAttemptEvaluationRequest
from app.services import evaluation_service


EXPECTED_BFS = """from collections import deque

def bfs(start, graph):
    if start not in graph:
        return []
    q = deque([start])
    visited = {start}
    out = []
    while q:
        node = q.popleft()
        out.append(node)
        for ngbr in graph[node]:
            if ngbr not in visited:
                visited.add(ngbr)
                q.append(ngbr)
    return out
"""

EQUIVALENT_BFS = EXPECTED_BFS.replace("for ngbr in graph[node]:", "for ngbr in graph.get(node, []):")


def _request(user_answer: str = EQUIVALENT_BFS) -> CoachAttemptEvaluationRequest:
    return CoachAttemptEvaluationRequest(
        cardTitle="BFS Skeleton",
        prompt="Implement breadth-first traversal.",
        expectedAnswer=EXPECTED_BFS,
        userAnswer=user_answer,
        skillTags=["graphs", "bfs-skeleton"],
        llmProvider="openai",
    )


@pytest.mark.asyncio
async def test_semantic_evaluation_awards_full_credit_to_equivalent_bfs(monkeypatch) -> None:
    captured = {}

    def fake_call(_system_prompt, payload, provider, *_args):
        captured.update({"payload": payload, "provider": provider})
        return {"sound": True, "syntaxValid": True}

    monkeypatch.setattr(evaluation_service, "_resolve_available_llm_provider", lambda _requested: "openai")
    monkeypatch.setattr(evaluation_service, "_llm_provider_available", lambda _provider: True)
    monkeypatch.setattr(evaluation_service, "_call_llm_json", fake_call)

    result = await evaluation_service.coach_attempt_evaluation(_request())

    assert result == {"sound": True, "syntaxValid": True, "llmUsed": True}
    assert captured["provider"] == "openai"
    assert "graph.get(node, [])" in captured["payload"]["userAnswer"]


@pytest.mark.asyncio
async def test_semantically_sound_response_is_normalized_to_full_credit(monkeypatch) -> None:
    monkeypatch.setattr(evaluation_service, "_resolve_available_llm_provider", lambda _requested: "openai")
    monkeypatch.setattr(evaluation_service, "_llm_provider_available", lambda _provider: True)
    monkeypatch.setattr(
        evaluation_service,
        "_call_llm_json",
        lambda *_args: {"sound": True, "syntaxValid": True},
    )

    result = await evaluation_service.coach_attempt_evaluation(_request())

    assert result["sound"] is True
    assert result["llmUsed"] is True


@pytest.mark.asyncio
async def test_unsound_response_cannot_round_up_to_full_credit(monkeypatch) -> None:
    monkeypatch.setattr(evaluation_service, "_resolve_available_llm_provider", lambda _requested: "openai")
    monkeypatch.setattr(evaluation_service, "_llm_provider_available", lambda _provider: True)
    monkeypatch.setattr(
        evaluation_service,
        "_call_llm_json",
        lambda *_args: {"sound": False, "syntaxValid": True},
    )

    result = await evaluation_service.coach_attempt_evaluation(_request())

    assert result["sound"] is False


@pytest.mark.asyncio
async def test_semantic_evaluation_falls_back_when_provider_is_unavailable(monkeypatch) -> None:
    monkeypatch.setattr(evaluation_service, "_resolve_available_llm_provider", lambda _requested: "openai")
    monkeypatch.setattr(evaluation_service, "_llm_provider_available", lambda _provider: False)

    result = await evaluation_service.coach_attempt_evaluation(_request())

    assert result["sound"] is False
    assert result["llmUsed"] is False
