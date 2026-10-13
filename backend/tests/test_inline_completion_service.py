from __future__ import annotations

import asyncio

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import main as app_main
from app.main import create_app
from app.models import InlineCompletionRequest
from app.services import inline_completion_service as service


def test_inline_completion_uses_code_context_without_canonical_answer(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_call(system_prompt, payload, provider, max_tokens, timeout_seconds, temperature):
        captured.update({
            "system_prompt": system_prompt,
            "payload": payload,
            "provider": provider,
            "max_tokens": max_tokens,
            "timeout_seconds": timeout_seconds,
            "temperature": temperature,
        })
        return {"completion": "    queue.append((row, col))"}

    monkeypatch.setattr(service, "resolve_available_llm_provider", lambda _: "openai")
    monkeypatch.setattr(service, "llm_provider_available", lambda _: True)
    monkeypatch.setattr(service, "call_llm_json", fake_call)

    result = asyncio.run(service.generate_inline_completion(InlineCompletionRequest(
        prefix="def oranges_rotting(grid):\n    queue = []\n",
        suffix="\n    return minutes",
        language="python",
        cardTitle="Multi-Source Grid BFS",
        prompt="Seed every rotten orange and expand by minute.",
    )))

    assert result.prediction == "    queue.append((row, col))"
    assert captured["provider"] == "openai"
    assert captured["payload"] == {
        "language": "python",
        "cardTitle": "Multi-Source Grid BFS",
        "task": "Seed every rotten orange and expand by minute.",
        "codeBeforeCursor": "def oranges_rotting(grid):\n    queue = []\n",
        "codeAfterCursor": "\n    return minutes",
    }
    assert "expectedAnswer" not in captured["payload"]


def test_inline_completion_skips_empty_input_and_missing_provider(monkeypatch) -> None:
    monkeypatch.setattr(service, "llm_provider_available", lambda _: False)
    assert asyncio.run(service.generate_inline_completion(InlineCompletionRequest(prefix="  ", suffix=""))).prediction == ""
    with pytest.raises(HTTPException) as error:
        asyncio.run(service.generate_inline_completion(InlineCompletionRequest(prefix="def solve():", suffix="")))
    assert error.value.status_code == 503


def test_inline_completion_endpoint_returns_prediction(monkeypatch) -> None:
    async def no_database():
        return None

    async def fake_completion(body):
        assert body.prefix == "def solve():\n    "
        return {"prediction": "return 0"}

    monkeypatch.setattr(app_main, "connect", no_database)
    monkeypatch.setattr(app_main, "disconnect", no_database)
    monkeypatch.setattr(service, "generate_inline_completion", fake_completion)

    with TestClient(create_app()) as client:
        response = client.post("/api/coach/inline-completion", json={
            "prefix": "def solve():\n    ",
            "suffix": "",
        })

    assert response.status_code == 200
    assert response.json() == {"prediction": "return 0"}
