"""Submission feedback transport and its error taxonomy."""

from __future__ import annotations

import io
import json
import urllib.error
from typing import Any

import pytest

from app.core import submission_llm_client as client
from app.domain import llm_resilience as resilience


class FakeResponse:
    def __init__(self, payload: Any):
        self._raw = json.dumps(payload).encode("utf-8")

    def read(self) -> bytes:
        return self._raw

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def http_error(code: int, body: str) -> urllib.error.HTTPError:
    return urllib.error.HTTPError("https://example.test", code, "error", {}, io.BytesIO(body.encode("utf-8")))


@pytest.fixture
def respond(monkeypatch):
    sent: list[dict[str, Any]] = []
    outcome: dict[str, Any] = {}

    def fake_urlopen(request, timeout):
        sent.append({"url": request.full_url, "body": json.loads(request.data.decode("utf-8"))})
        value = outcome["value"]
        if isinstance(value, BaseException):
            raise value
        return FakeResponse(value)

    monkeypatch.setattr(client.urllib.request, "urlopen", fake_urlopen)
    for name, value in {
        "coach_openai_api_key": "sk",
        "coach_anthropic_api_key": "ak",
        "coach_gemma_api_key": "gk",
        "coach_anthropic_model": "",
        "coach_gemma_model": "",
    }.items():
        monkeypatch.setattr(client.settings, name, value)

    def set_outcome(value: Any) -> list[dict[str, Any]]:
        outcome["value"] = value
        return sent

    return set_outcome


@pytest.mark.parametrize(
    ("provider", "key"),
    [("claude", "coach_anthropic_api_key"), ("gemma", "coach_gemma_api_key"), ("openai", "coach_openai_api_key")],
)
def test_missing_key_is_an_auth_error(monkeypatch, provider, key) -> None:
    monkeypatch.setattr(client.settings, key, "")
    parsed, code, message, retryable = client.call_llm_json_for_submission("sys", {}, provider)
    assert (parsed, code, retryable) == (None, "provider_auth_error", False)
    assert "missing" in message


def test_claude_success_uses_default_model(respond) -> None:
    sent = respond({"content": [{"type": "text", "text": '{"verdict": "sound"}'}]})
    assert client.call_llm_json_for_submission("sys", {"a": 1}, "claude") == ({"verdict": "sound"}, "", "", False)
    assert sent[0]["body"]["model"] == "claude-sonnet-4-6"


@pytest.mark.parametrize(
    ("payload", "code"),
    [
        ({"content": "text"}, "provider_response_format_error"),
        ({"content": []}, "provider_empty_response"),
        ({"content": [{"type": "text", "text": "nope"}]}, "provider_invalid_json"),
    ],
)
def test_claude_bad_responses(respond, payload, code) -> None:
    respond(payload)
    parsed, got, _message, retryable = client.call_llm_json_for_submission("sys", {}, "claude")
    assert (parsed, got, retryable) == (None, code, True)


def test_gemma_success_and_failure(respond) -> None:
    sent = respond({"candidates": [{"content": {"parts": [{"text": '{"ok": 1}'}]}}]})
    assert client.call_llm_json_for_submission("sys", {}, "gemma")[0] == {"ok": 1}
    assert "gemma-4-31b-it:generateContent" in sent[0]["url"]
    respond({"candidates": []})
    assert client.call_llm_json_for_submission("sys", {}, "gemma")[1] == "provider_invalid_json"


def test_openai_success_and_invalid_json(respond) -> None:
    respond({"choices": [{"message": {"content": '{"ok": true}'}}]})
    assert client.call_llm_json_for_submission("sys", {}, "openai")[0] == {"ok": True}
    respond({"choices": [{"message": {"content": "plain text"}}]})
    assert client.call_llm_json_for_submission("sys", {}, "openai")[1] == "provider_invalid_json"


def test_http_errors_are_classified(respond) -> None:
    respond(http_error(429, '{"error": {"message": "Rate limit reached"}}'))
    assert client.call_llm_json_for_submission("sys", {}, "openai")[1:] == (
        "provider_rate_limited",
        "ChatGPT API error: rate limited. Please retry in a moment.",
        True,
    )


def test_exceptions_are_classified(respond) -> None:
    respond(TimeoutError("slow"))
    assert client.call_llm_json_for_submission("sys", {}, "claude")[1] == "provider_timeout"
    respond({"choices": []})
    assert client.call_llm_json_for_submission("sys", {}, "openai")[1] == "provider_unknown_error"


# ── llm_resilience ──


@pytest.mark.parametrize(
    ("status", "body", "code", "retryable"),
    [
        (400, '{"error": {"message": "Your credit balance is too low"}}', "provider_insufficient_credits", False),
        (401, "", "provider_auth_error", False),
        (400, '{"message": "invalid api key"}', "provider_auth_error", False),
        (429, "", "provider_rate_limited", True),
        (404, '{"error": {"message": "model gone"}}', "provider_model_error", False),
        (503, "", "provider_server_error", True),
        (400, "plain words", "provider_request_error", False),
        (418, "", "provider_request_error", False),
    ],
)
def test_http_error_taxonomy(status, body, code, retryable) -> None:
    got, message, got_retryable = resilience.submission_provider_error_from_http("Claude", status, body)
    assert (got, got_retryable) == (code, retryable)
    assert message.startswith("Claude API error")


def test_request_error_message_includes_status_when_body_empty() -> None:
    assert "status 418" in resilience.submission_provider_error_from_http("X", 418, "")[1]
    assert "plain words" in resilience.submission_provider_error_from_http("X", 400, "plain words")[1]


def test_extract_provider_error_message_shapes() -> None:
    assert resilience.extract_provider_error_message("") == ""
    assert resilience.extract_provider_error_message('{"error": {"message": "boom"}}') == "boom"
    assert resilience.extract_provider_error_message('{"message": "top"}') == "top"
    assert resilience.extract_provider_error_message('{"other": 1}') == '{"other": 1}'
    assert resilience.extract_provider_error_message("x" * 400) == "x" * 300


def test_exception_taxonomy() -> None:
    assert resilience.submission_provider_error_from_exception("X", TimeoutError())[0] == "provider_timeout"
    network = resilience.submission_provider_error_from_exception("X", urllib.error.URLError("refused"))
    assert network[0] == "provider_network_error" and "(refused)" in network[1]
    assert resilience.submission_provider_error_from_exception("X", ValueError())[0] == "provider_unknown_error"


def test_http_exception_carries_structured_detail() -> None:
    error = resilience.SubmissionFeedbackUnavailableError("provider_timeout", "slow", "claude", "E1")
    exc = resilience.coach_llm_http_exception(error, "Claude")
    assert exc.status_code == 503
    assert exc.detail == {
        "code": "provider_timeout",
        "message": "slow",
        "provider": "claude",
        "providerLabel": "Claude",
        "apiErrorCode": "E1",
    }
