from __future__ import annotations

import json

import httpx
import pytest

from app.core.jev import HttpJevGateway, JevUnavailableError, choice, noul, score

QUESTIONS = {
    "correctness": choice("Did they pick it?", {"1": "yes", "0": "no"}),
    "grade": score("How close?", ["far", "near"]),
    "seen": noul("Recognized?"),
}

ANSWERS = {
    "correctness": {"type": "choice", "choice": "1", "confidence": 0.9, "probabilities": {"1": 0.95, "0": 0.05}},
    "grade": {"type": "score", "score": 1.0, "confidence": 0.8, "probabilities": {}, "legend": {}},
    "seen": {"type": "noul", "noul": 0.7},
}


def _gateway(handler, **overrides) -> HttpJevGateway:
    options = {"api_key": "test-key", "model": "jev-test", "retry_delay_seconds": 0.0}
    options.update(overrides)
    return HttpJevGateway(transport=httpx.MockTransport(handler), **options)


@pytest.mark.asyncio
async def test_system_one_posts_wire_format_and_parses_answers() -> None:
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["path"] = request.url.path
        seen["auth"] = request.headers["authorization"]
        seen["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={"model": "jev-1.13.0", "answers": ANSWERS, "usage": {"input_tokens": 10, "output_tokens": 3}},
            headers={"x-typesafe-request-id": "req-1"},
        )

    response = await _gateway(handler).system_one({"question": "q"}, QUESTIONS)

    assert seen["path"] == "/v1/systemone"
    assert seen["auth"] == "Bearer test-key"
    assert seen["body"] == {"model": "jev-test", "state": {"question": "q"}, "questions": QUESTIONS}
    assert response.model == "jev-1.13.0"
    assert response.request_id == "req-1"
    assert response.answers["correctness"]["choice"] == "1"
    assert response.usage == {"input_tokens": 10, "output_tokens": 3}
    assert response.attempts == 1 and response.latency_ms >= 0


@pytest.mark.asyncio
async def test_system_one_retries_retryable_statuses() -> None:
    calls = {"count": 0}

    def handler(_request: httpx.Request) -> httpx.Response:
        calls["count"] += 1
        if calls["count"] == 1:
            return httpx.Response(503, text="busy")
        return httpx.Response(200, json={"model": "m", "answers": ANSWERS})

    response = await _gateway(handler).system_one("state", QUESTIONS)

    assert calls["count"] == 2
    assert response.attempts == 2
    assert response.answers["seen"]["noul"] == 0.7


@pytest.mark.asyncio
async def test_system_one_does_not_retry_client_errors() -> None:
    calls = {"count": 0}

    def handler(_request: httpx.Request) -> httpx.Response:
        calls["count"] += 1
        return httpx.Response(400, text="bad question")

    with pytest.raises(JevUnavailableError) as error:
        await _gateway(handler).system_one("state", QUESTIONS)

    assert calls["count"] == 1
    assert error.value.code == "jev_http_error"
    assert error.value.status == 400


@pytest.mark.asyncio
async def test_system_one_rejects_missing_or_mistyped_answers() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        answers = {**ANSWERS, "seen": {"type": "choice", "choice": "1"}}
        return httpx.Response(200, json={"model": "m", "answers": answers})

    with pytest.raises(JevUnavailableError) as error:
        await _gateway(handler).system_one("state", QUESTIONS)

    assert error.value.code == "jev_invalid_response"


@pytest.mark.asyncio
async def test_system_one_requires_an_api_key() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        raise AssertionError("no request should be sent")

    with pytest.raises(JevUnavailableError) as error:
        await _gateway(handler, api_key=" ").system_one("state", QUESTIONS)

    assert error.value.code == "jev_missing_api_key"
