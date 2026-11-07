"""Provider HTTP calls in ``app.core.llm``, with ``_urlopen`` replaced by a scripted fake."""

from __future__ import annotations

import io
import json
import urllib.error
from typing import Any

import pytest

from app.core import llm


class FakeResponse:
    def __init__(self, payload: Any):
        self._raw = json.dumps(payload).encode("utf-8") if not isinstance(payload, bytes) else payload

    def read(self) -> bytes:
        return self._raw

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def http_error(code: int, body: str) -> urllib.error.HTTPError:
    return urllib.error.HTTPError("https://example.test", code, "error", {}, io.BytesIO(body.encode("utf-8")))


@pytest.fixture
def calls(monkeypatch):
    """Script ``_urlopen``: append responses (or exceptions) to ``calls.script``."""

    class Recorder:
        script: list[Any] = []
        requests: list[dict[str, Any]] = []

    recorder = Recorder()
    recorder.script = []
    recorder.requests = []

    def fake_urlopen(request, timeout):
        recorder.requests.append(
            {"url": request.full_url, "body": json.loads(request.data.decode("utf-8")), "headers": dict(request.headers)}
        )
        outcome = recorder.script.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        return FakeResponse(outcome)

    monkeypatch.setattr(llm, "_urlopen", fake_urlopen)
    return recorder


@pytest.fixture
def keys(monkeypatch):
    monkeypatch.setattr(llm.settings, "coach_openai_api_key", "sk-test")
    monkeypatch.setattr(llm.settings, "coach_anthropic_api_key", "ak-test")
    monkeypatch.setattr(llm.settings, "coach_gemma_api_key", "gk-test")
    monkeypatch.setattr(llm.settings, "coach_anthropic_model", "claude-configured")
    monkeypatch.setattr(llm.settings, "coach_llm_provider", "openai")


def openai_reply(content: str) -> dict:
    return {"choices": [{"message": {"content": content}}]}


# ── provider selection ──


def test_provider_labels() -> None:
    assert llm.llm_provider_label("claude") == "Claude"
    assert llm.llm_provider_label("gemma") == "Gemma"
    assert llm.llm_provider_label("openai") == "ChatGPT"


def test_resolve_provider_prefers_request_then_config(monkeypatch) -> None:
    monkeypatch.setattr(llm.settings, "coach_llm_provider", "anthropic")
    assert llm.resolve_llm_provider("gemma") == "gemma"
    assert llm.resolve_llm_provider("") == "claude"
    monkeypatch.setattr(llm.settings, "coach_llm_provider", "")
    assert llm.resolve_llm_provider("nonsense") == "openai"


def test_resolve_available_provider_skips_providers_without_keys(monkeypatch) -> None:
    monkeypatch.setattr(llm.settings, "coach_llm_provider", "openai")
    monkeypatch.setattr(llm.settings, "coach_openai_api_key", "")
    monkeypatch.setattr(llm.settings, "coach_anthropic_api_key", "")
    monkeypatch.setattr(llm.settings, "coach_gemma_api_key", "gk")
    assert llm.llm_provider_available("gemma")
    assert not llm.llm_provider_available("claude")
    assert not llm.llm_provider_available("openai")
    assert llm.resolve_available_llm_provider("claude") == "gemma"


def test_resolve_available_provider_falls_back_when_no_keys(monkeypatch) -> None:
    for name in ("coach_openai_api_key", "coach_anthropic_api_key", "coach_gemma_api_key"):
        monkeypatch.setattr(llm.settings, name, "")
    monkeypatch.setattr(llm.settings, "coach_llm_provider", "")
    assert llm.resolve_available_llm_provider("claude") == "claude"


def test_extract_json_dict_rejects_non_objects() -> None:
    assert llm.extract_json_dict("[1, 2]") is None
    assert llm.extract_json_dict("no json here") is None
    assert llm.extract_json_dict("prefix {broken then {\"ok\": 1}") == {"ok": 1}


def test_ssl_context_uses_certifi() -> None:
    assert llm._ssl_context() is not None


# ── OpenAI ──


def test_openai_without_key_returns_none(monkeypatch, calls) -> None:
    monkeypatch.setattr(llm.settings, "coach_openai_api_key", "")
    assert llm.call_openai_json("sys", {"a": 1}) is None
    assert calls.requests == []


def test_openai_parses_json_content(keys, calls) -> None:
    calls.script.append(openai_reply('{"answer": 42}'))
    assert llm.call_openai_json("sys", {"a": 1}, max_tokens=10, temperature=0.5) == {"answer": 42}
    sent = calls.requests[0]
    assert sent["url"].endswith("/chat/completions")
    assert sent["body"]["max_completion_tokens"] == 10
    assert sent["body"]["temperature"] == 0.5
    assert sent["headers"]["Authorization"] == "Bearer sk-test"


def test_openai_retries_with_max_tokens_when_unsupported(keys, calls) -> None:
    calls.script += [
        http_error(400, "max_completion_tokens is Unsupported for this model"),
        openai_reply('{"ok": true}'),
    ]
    assert llm.call_openai_json("sys", {}, max_tokens=7) == {"ok": True}
    retry = calls.requests[1]["body"]
    assert "max_completion_tokens" not in retry
    assert retry["max_tokens"] == 7


def test_openai_fallback_failure_returns_none(keys, calls) -> None:
    calls.script += [
        http_error(400, "max_completion_tokens unsupported"),
        urllib.error.URLError("down"),
    ]
    assert llm.call_openai_json("sys", {}) is None


def test_openai_other_http_error_returns_none(keys, calls) -> None:
    calls.script.append(http_error(401, "bad key"))
    assert llm.call_openai_json("sys", {}) is None


def test_openai_malformed_payload_returns_none(keys, calls) -> None:
    calls.script.append({"choices": []})
    assert llm.call_openai_json("sys", {}) is None


# ── Claude ──


def claude_reply(*texts: str) -> dict:
    return {"content": [{"type": "text", "text": text} for text in texts]}


def test_claude_without_key_returns_none(monkeypatch, calls) -> None:
    monkeypatch.setattr(llm.settings, "coach_anthropic_api_key", "")
    assert llm.call_claude_json("sys", {}) is None


def test_claude_joins_text_blocks(keys, calls) -> None:
    calls.script.append(claude_reply('{"a":', ' 1}'))
    assert llm.call_claude_json("sys", {"q": 1}) == {"a": 1}
    sent = calls.requests[0]
    assert sent["body"]["model"] == "claude-configured"
    assert sent["headers"]["X-api-key"] == "ak-test"


def test_claude_tries_next_model_when_model_missing(keys, calls) -> None:
    calls.script += [http_error(404, "model not found"), claude_reply('{"ok": 1}')]
    assert llm.call_claude_json("sys", {}) == {"ok": 1}
    assert calls.requests[1]["body"]["model"] == llm.ANTHROPIC_MODEL_CANDIDATES[0]


def test_claude_other_http_error_stops(keys, calls) -> None:
    calls.script.append(http_error(429, "rate limited"))
    assert llm.call_claude_json("sys", {}) is None
    assert len(calls.requests) == 1


def test_claude_timeouts_try_next_model(keys, calls) -> None:
    calls.script += [TimeoutError("slow"), urllib.error.URLError("timed out"), claude_reply('{"ok": 2}')]
    assert llm.call_claude_json("sys", {}) == {"ok": 2}


def test_claude_url_error_stops(keys, calls) -> None:
    calls.script.append(urllib.error.URLError("connection refused"))
    assert llm.call_claude_json("sys", {}) is None


@pytest.mark.parametrize(
    "payload",
    [{"content": "not a list"}, {"content": [{"type": "image"}]}, claude_reply("no json at all")],
)
def test_claude_unusable_content_returns_none(keys, calls, payload) -> None:
    calls.script.append(payload)
    assert llm.call_claude_json("sys", {}) is None


def test_claude_runs_out_of_models(keys, calls) -> None:
    models = 1 + len(llm.ANTHROPIC_MODEL_CANDIDATES)
    calls.script += [http_error(400, "unknown model") for _ in range(models)]
    assert llm.call_claude_json("sys", {}) is None
    assert len(calls.requests) == models


# ── Gemma ──


def test_gemma_without_key_returns_none(monkeypatch, calls) -> None:
    monkeypatch.setattr(llm.settings, "coach_gemma_api_key", "")
    assert llm.call_gemma_json("sys", {}) is None


def test_gemma_parses_candidate_text(keys, calls) -> None:
    calls.script.append({"candidates": [{"content": {"parts": [{"text": '{"g": 1}'}]}}]})
    assert llm.call_gemma_json("sys", {}) == {"g": 1}
    assert ":generateContent?key=gk-test" in calls.requests[0]["url"]


def test_gemma_without_candidates_returns_none(keys, calls) -> None:
    calls.script.append({"candidates": []})
    assert llm.call_gemma_json("sys", {}) is None


def test_gemma_error_returns_none(keys, calls) -> None:
    calls.script.append(urllib.error.URLError("down"))
    assert llm.call_gemma_json("sys", {}) is None


# ── dispatch ──


def test_call_llm_json_dispatches_by_provider(monkeypatch) -> None:
    seen: list[str] = []
    monkeypatch.setattr(llm, "call_claude_json", lambda *a: seen.append("claude") or {})
    monkeypatch.setattr(llm, "call_gemma_json", lambda *a: seen.append("gemma") or {})
    monkeypatch.setattr(llm, "call_openai_json", lambda *a: seen.append("openai") or {})
    for provider in ("claude", "gemma", "openai", "other"):
        llm.call_llm_json("sys", {}, provider)
    assert seen == ["claude", "gemma", "openai", "openai"]
