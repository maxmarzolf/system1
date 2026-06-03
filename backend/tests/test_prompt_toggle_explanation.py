from __future__ import annotations

from fastapi.testclient import TestClient

from app import main as app_main
from app.main import create_app
from app.services import prompt_explanation_service


def test_prompt_toggle_explanation_route_uses_llm(monkeypatch) -> None:
    monkeypatch.setattr(prompt_explanation_service, "_resolve_available_llm_provider", lambda _requested: "openai")
    monkeypatch.setattr(prompt_explanation_service, "_llm_provider_available", lambda _provider: True)
    monkeypatch.setattr(
        prompt_explanation_service,
        "_call_llm_json",
        lambda *_args, **_kwargs: {
            "plainEnglish": "It walks the array and keeps a running window.",
            "inputExample": "nums = [1, 4, 2, 10, 3]\nk = 3",
            "outputExample": "16",
        },
    )

    async def _noop_connect():
        return None

    async def _noop_disconnect():
        return None

    monkeypatch.setattr(app_main, "connect", _noop_connect)
    monkeypatch.setattr(app_main, "disconnect", _noop_disconnect)

    app = create_app()
    with TestClient(app) as client:
        response = client.post(
            "/api/coach/prompt-toggle-explanation",
            json={
                "cardId": "card-1",
                "cardTitle": "Sliding Window Warmup",
                "prompt": "What is the maximum sum of any size-k window?",
                "target": "def solve(nums, k):\n    return 0",
                "tags": ["skill-map", "sliding-window"],
                "llmProvider": "openai",
            },
        )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["llmUsed"] is True
    assert payload["plainEnglish"] == "It walks the array and keeps a running window."
    assert payload["inputExample"] == "nums = [1, 4, 2, 10, 3]\nk = 3"
    assert payload["outputExample"] == "16"
