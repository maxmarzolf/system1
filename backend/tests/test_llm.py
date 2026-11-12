"""The consolidated LLM client: providers, error taxonomy, fallbacks and streaming."""

from __future__ import annotations

import io
import json
import urllib.error
from typing import Any

import pytest

from app.core import llm
from app.core.llm import LlmUnavailableError


class FakeResponse:
    def __init__(self, payload: Any = None, lines: list[str] | None = None):
        self._raw = json.dumps(payload).encode("utf-8")
        self._lines = [line.encode("utf-8") for line in lines or []]

    def read(self) -> bytes:
        return self._raw

    def __iter__(self):
        return iter(self._lines)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def http_error(code: int, body: str) -> urllib.error.HTTPError:
    return urllib.error.HTTPError("https://example.test", code, "error", {}, io.BytesIO(body.encode("utf-8")))


@pytest.fixture
def calls(monkeypatch):
    """Script ``_urlopen``: append replies (dicts, FakeResponses or exceptions) to ``calls.script``."""

    class Recorder:
        def __init__(self):
            self.script: list[Any] = []
            self.requests: list[dict[str, Any]] = []

    recorder = Recorder()

    def fake_urlopen(request, timeout):
        recorder.requests.append(
            {"url": request.full_url, "body": json.loads(request.data), "headers": dict(request.headers), "timeout": timeout}
        )
        outcome = recorder.script.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome if isinstance(outcome, FakeResponse) else FakeResponse(outcome)

    monkeypatch.setattr(llm, "_urlopen", fake_urlopen)
    return recorder


@pytest.fixture
def keys(monkeypatch):
    for name, value in {
        "coach_openai_api_key": "sk",
        "coach_anthropic_api_key": "ak",
        "coach_gemma_api_key": "gk",
        "coach_anthropic_model": "claude-configured",
        "coach_gemma_model": "",
        "coach_llm_provider": "openai",
    }.items():
        monkeypatch.setattr(llm.settings, name, value)


def openai_reply(content: str) -> dict:
    return {"choices": [{"message": {"content": content}}]}


def claude_reply(*texts: str) -> dict:
    return {"content": [{"type": "text", "text": text} for text in texts]}


# ─── Provider selection ───


def test_provider_labels_and_resolution(monkeypatch) -> None:
    assert [llm.llm_provider_label(p) for p in ("claude", "gemma", "openai")] == ["Claude", "Gemma", "ChatGPT"]
    monkeypatch.setattr(llm.settings, "coach_llm_provider", "anthropic")
    assert llm.resolve_llm_provider("gemma") == "gemma"
    assert llm.resolve_llm_provider("") == "claude"
    monkeypatch.setattr(llm.settings, "coach_llm_provider", "")
    assert llm.resolve_llm_provider("nonsense") == "openai"


def test_available_provider_skips_providers_without_keys(monkeypatch) -> None:
    monkeypatch.setattr(llm.settings, "coach_llm_provider", "openai")
    for name, value in {"coach_openai_api_key": "", "coach_anthropic_api_key": "", "coach_gemma_api_key": "gk"}.items():
        monkeypatch.setattr(llm.settings, name, value)
    assert llm.resolve_available_llm_provider("claude") == "gemma"
    assert llm.require_available_provider("claude") == "gemma"


def test_require_available_provider_raises_without_any_key(monkeypatch) -> None:
    for name in ("coach_openai_api_key", "coach_anthropic_api_key", "coach_gemma_api_key", "coach_llm_provider"):
        monkeypatch.setattr(llm.settings, name, "")
    assert llm.resolve_available_llm_provider("claude") == "claude"
    with pytest.raises(LlmUnavailableError) as error:
        llm.require_available_provider("claude")
    assert error.value.code == "coach_llm_missing_api_key"


def test_extract_json_dict_shapes() -> None:
    assert llm.extract_json_dict('```json\n{"a": 1}\n```') == {"a": 1}
    assert llm.extract_json_dict('Here: {"ok": true} thanks') == {"ok": True}
    assert llm.extract_json_dict("[1, 2]") is None
    assert llm.extract_json_dict("no json") is None
    assert llm.extract_json_dict('prefix {broken then {"ok": 1}') == {"ok": 1}


def test_ssl_context_uses_certifi() -> None:
    assert llm._ssl_context() is not None


# ─── OpenAI ───


def test_openai_parses_json_and_sends_settings(keys, calls) -> None:
    calls.script.append(openai_reply('{"answer": 42}'))
    assert llm.complete_json("sys", {"a": 1}, "openai", max_tokens=10, temperature=0.5) == {"answer": 42}
    sent = calls.requests[0]
    assert sent["url"].endswith("/chat/completions")
    assert sent["body"]["max_completion_tokens"] == 10 and sent["body"]["temperature"] == 0.5
    assert sent["headers"]["Authorization"] == "Bearer sk"
    assert "Return only valid JSON" in sent["body"]["messages"][0]["content"]


def test_openai_retries_with_max_tokens_on_older_models(keys, calls) -> None:
    calls.script += [http_error(400, "max_completion_tokens is Unsupported"), openai_reply('{"ok": true}')]
    assert llm.complete_json("sys", {}, "openai", max_tokens=7) == {"ok": True}
    retry = calls.requests[1]["body"]
    assert "max_completion_tokens" not in retry and retry["max_tokens"] == 7


@pytest.mark.parametrize(
    ("reply", "code"),
    [
        (http_error(401, "bad key"), "provider_auth_error"),
        (http_error(429, '{"error": {"message": "Rate limit reached"}}'), "provider_rate_limited"),
        ({"choices": []}, "provider_response_format_error"),
        (openai_reply("plain text"), "provider_invalid_json"),
        (urllib.error.URLError("down"), "provider_network_error"),
        (TimeoutError("slow"), "provider_timeout"),
    ],
)
def test_openai_failures_are_classified(keys, calls, reply, code) -> None:
    calls.script.append(reply)
    with pytest.raises(LlmUnavailableError) as error:
        llm.complete_json("sys", {}, "openai")
    assert error.value.code == code and error.value.provider == "openai"


def test_missing_key_is_an_auth_error(monkeypatch, calls) -> None:
    monkeypatch.setattr(llm.settings, "coach_openai_api_key", "")
    with pytest.raises(LlmUnavailableError) as error:
        llm.complete_json("sys", {}, "openai")
    assert (error.value.code, error.value.retryable) == ("provider_auth_error", False)
    assert calls.requests == []


# ─── Claude ───


def test_claude_joins_text_blocks(keys, calls) -> None:
    calls.script.append(claude_reply('{"a":', " 1}"))
    assert llm.complete_json("sys", {"q": 1}, "claude") == {"a": 1}
    assert calls.requests[0]["body"]["model"] == "claude-configured"
    assert calls.requests[0]["headers"]["X-api-key"] == "ak"


def test_claude_tries_the_next_model_and_survives_timeouts(keys, calls) -> None:
    calls.script += [
        http_error(404, "model not found"),
        TimeoutError("slow"),
        urllib.error.URLError("timed out"),
        claude_reply('{"ok": 1}'),
    ]
    assert llm.complete_json("sys", {}, "claude") == {"ok": 1}
    assert [request["body"]["model"] for request in calls.requests][:2] == [
        "claude-configured",
        llm.ANTHROPIC_MODEL_CANDIDATES[0],
    ]


def test_claude_running_out_of_models_reports_the_last_failure(keys, calls) -> None:
    calls.script += [http_error(400, "unknown model") for _ in range(1 + len(llm.ANTHROPIC_MODEL_CANDIDATES))]
    with pytest.raises(LlmUnavailableError) as error:
        llm.complete_json("sys", {}, "claude")
    assert error.value.code == "provider_model_error"


@pytest.mark.parametrize(
    ("reply", "code"),
    [
        ({"content": "text"}, "provider_response_format_error"),
        ({"content": [{"type": "image"}]}, "provider_empty_response"),
        (http_error(400, '{"error": {"message": "Your credit balance is too low"}}'), "provider_insufficient_credits"),
        (http_error(503, ""), "provider_server_error"),
        (urllib.error.URLError("connection refused"), "provider_network_error"),
    ],
)
def test_claude_failures_are_classified(keys, calls, reply, code) -> None:
    calls.script.append(reply)
    with pytest.raises(LlmUnavailableError) as error:
        llm.complete_json("sys", {}, "claude")
    assert error.value.code == code


# ─── Gemma ───


def test_gemma_sends_the_key_in_a_header_not_the_url(keys, calls) -> None:
    calls.script.append({"candidates": [{"content": {"parts": [{"text": '{"g": 1}'}]}}]})
    assert llm.complete_json("sys", {}, "gemma") == {"g": 1}
    sent = calls.requests[0]
    assert sent["url"].endswith("/models/gemma-4-31b-it:generateContent")
    assert "key=" not in sent["url"]
    assert sent["headers"]["X-goog-api-key"] == "gk"


def test_gemma_without_candidates_is_invalid_json(keys, calls) -> None:
    calls.script.append({"candidates": []})
    with pytest.raises(LlmUnavailableError) as error:
        llm.complete_json("sys", {}, "gemma")
    assert error.value.code == "provider_invalid_json"


# ─── Wrappers ───


def test_call_llm_json_returns_none_on_failure(keys, calls, monkeypatch) -> None:
    calls.script.append(http_error(500, "boom"))
    assert llm.call_llm_json("sys", {}, "openai") is None
    monkeypatch.setattr(llm.settings, "coach_openai_api_key", "")
    assert llm.call_llm_json("sys", {}, "openai") is None
    assert llm.call_llm_json("sys", {}, "unknown-provider") is None


def test_submission_wrapper_returns_the_error_tuple(keys, calls) -> None:
    calls.script.append(openai_reply('{"verdict": "sound"}'))
    assert llm.call_llm_json_for_submission("sys", {}, "openai") == ({"verdict": "sound"}, "", "", False)
    calls.script.append(TimeoutError("slow"))
    data, code, _message, retryable = llm.call_llm_json_for_submission("sys", {}, "gemma")
    assert (data, code, retryable) == (None, "provider_timeout", True)
    assert calls.requests[-1]["timeout"] == 60


def test_streaming_yields_deltas(keys, calls) -> None:
    lines = [": keep-alive", ""]
    lines += [f"data: {json.dumps({'choices': [{'delta': {'content': delta}}]})}" for delta in ("ab", "", "cd")]
    lines += ["data: not json", "data: [DONE]", "data: ignored"]
    calls.script.append(FakeResponse(lines=lines))
    assert list(llm.stream_openai_text("sys", {"a": 1}, 10, 5, 0.3)) == ["ab", "cd"]
    assert calls.requests[0]["body"]["stream"] is True


def test_streaming_without_a_key_yields_nothing(monkeypatch) -> None:
    monkeypatch.setattr(llm.settings, "coach_openai_api_key", "")
    assert list(llm.stream_openai_text("sys", {})) == []


# ─── Error taxonomy ───


def test_error_messages_from_payloads() -> None:
    assert llm.extract_provider_error_message("") == ""
    assert llm.extract_provider_error_message('{"error": {"message": "boom"}}') == "boom"
    assert llm.extract_provider_error_message('{"message": "top"}') == "top"
    assert llm.extract_provider_error_message('{"other": 1}') == '{"other": 1}'
    assert llm.extract_provider_error_message("x" * 400) == "x" * 300


@pytest.mark.parametrize(
    ("status", "body", "code"),
    [
        (400, '{"message": "invalid api key"}', "provider_auth_error"),
        (404, '{"error": {"message": "model gone"}}', "provider_model_error"),
        (400, "plain words", "provider_request_error"),
        (418, "", "provider_request_error"),
    ],
)
def test_http_error_taxonomy(status, body, code) -> None:
    assert llm.submission_provider_error_from_http("Claude", status, body)[0] == code


def test_exception_taxonomy() -> None:
    assert llm.submission_provider_error_from_exception("X", ValueError())[0] == "provider_unknown_error"
    assert "(refused)" in llm.submission_provider_error_from_exception("X", urllib.error.URLError("refused"))[1]


# ─── Call settings, usage and exchange capture ───


def test_a_task_model_goes_first_and_falls_back_to_the_configured_model(keys, calls) -> None:
    calls.script += [http_error(404, "model not found"), {**claude_reply('{"ok": 1}'), "usage": {"input_tokens": 9, "output_tokens": 4}}]
    call = llm.LlmCall(max_tokens=50, timeout_seconds=5, temperature=0.1, models={"claude": "claude-fast"})
    assert llm.complete_json_call("sys", {}, "claude", call) == {"ok": 1}
    assert [request["body"]["model"] for request in calls.requests] == ["claude-fast", "claude-configured"]
    assert calls.requests[0]["body"]["max_tokens"] == 50 and calls.requests[0]["timeout"] == 5


def test_openai_and_gemma_use_a_task_model(keys, calls) -> None:
    calls.script += [openai_reply('{"a": 1}'), {"candidates": [{"content": {"parts": [{"text": '{"g": 1}'}]}}]}]
    call = llm.LlmCall(models={"openai": "gpt-fast", "gemma": "gemma-fast"})
    llm.complete_json_call("sys", {}, "openai", call)
    llm.complete_json_call("sys", {}, "gemma", call)
    assert calls.requests[0]["body"]["model"] == "gpt-fast"
    assert calls.requests[1]["url"].endswith("/models/gemma-fast:generateContent")


def test_capture_records_successes_and_failures_with_usage_but_never_keys(keys, calls) -> None:
    calls.script += [
        {**openai_reply('{"answer": 1}'), "model": "gpt-x", "usage": {"prompt_tokens": 12, "completion_tokens": 5}},
        openai_reply("not json"),
    ]
    with llm.capture_llm_exchanges() as exchanges:
        llm.complete_json("sys prompt", {"q": 1}, "openai", max_tokens=40, temperature=0.3)
        with pytest.raises(LlmUnavailableError):
            llm.complete_json("sys prompt", {"q": 2}, "openai")
    ok, failed = exchanges
    assert ok["attempt"] == 1 and ok["ok"] is True and ok["model"] == "gpt-x"
    assert ok["systemPrompt"] == "sys prompt" and ok["payload"] == {"q": 1}
    assert ok["parsed"] == {"answer": 1} and ok["reply"] == '{"answer": 1}'
    assert ok["usage"] == {"inputTokens": 12, "outputTokens": 5}
    assert ok["maxTokens"] == 40 and ok["temperature"] == 0.3 and isinstance(ok["latencyMs"], int)
    assert failed["attempt"] == 2 and failed["ok"] is False and failed["reply"] == "not json"
    assert failed["error"]["code"] == "provider_invalid_json"
    stored = json.dumps(exchanges)
    assert "Bearer" not in stored and "headers" not in stored and '"sk"' not in stored


def test_nothing_is_recorded_outside_a_capture(keys, calls) -> None:
    calls.script.append(openai_reply('{"a": 1}'))
    llm.complete_json("sys", {}, "openai")
    with llm.capture_llm_exchanges() as exchanges:
        pass
    assert exchanges == []


@pytest.mark.asyncio
async def test_capture_sees_calls_made_in_worker_threads(keys, calls) -> None:
    import asyncio

    calls.script.append(openai_reply('{"a": 1}'))
    with llm.capture_llm_exchanges() as exchanges:
        await asyncio.to_thread(llm.complete_json, "sys", {}, "openai")
    assert len(exchanges) == 1 and exchanges[0]["ok"] is True


@pytest.mark.asyncio
async def test_fallback_retries_then_walks_the_provider_chain() -> None:
    seen: list[str] = []

    def call_json(_system, _payload, provider, _call):
        seen.append(provider)
        return {"value": 7} if provider == "openai" else {"wrong": True}

    outcome = await llm.complete_json_with_fallback(
        "sys", {}, ["claude", "openai"], llm.LlmCall(), lambda reply: reply.get("value"),
        call_json=call_json, retry_delays_seconds=(0, 0),
    )
    assert outcome == (7, "openai")
    assert seen == ["claude", "claude", "claude", "openai"]

    nothing = await llm.complete_json_with_fallback(
        "sys", {}, ["claude"], llm.LlmCall(), lambda _reply: None, call_json=lambda *_a: None, retry_delays_seconds=(0,),
    )
    assert nothing is None

