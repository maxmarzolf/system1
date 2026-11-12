"""Thin async client for Jev over the documented REST API (``POST /v1/systemone``).

Questions are plain wire-format dicts so callers (signal plugins, evaluators)
never depend on an SDK. The official ``typesafe-sdk`` requires pydantic>=2.12,
which this service does not pin yet; the wire contract is identical.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from typing import Any, Protocol

import httpx

SYSTEM_ONE_PATH = "/v1/systemone"
REQUEST_ID_HEADER = "x-typesafe-request-id"
RETRYABLE_STATUSES = frozenset({408, 409, 429, 500, 502, 503, 504})

JevQuestion = dict[str, Any]
JevState = str | dict[str, Any] | list[Any]


def choice(instructions: Any, criteria: Mapping[str, Any]) -> JevQuestion:
    return {"type": "choice", "instructions": instructions, "criteria": dict(criteria)}


def score(instructions: Any, criteria: list[Any]) -> JevQuestion:
    return {"type": "score", "instructions": instructions, "criteria": list(criteria)}


def noul(instructions: Any, criteria: Mapping[str, Any] | None = None) -> JevQuestion:
    """A yes/no question; ``criteria`` may describe the ``true`` and ``false`` outcomes."""
    question: JevQuestion = {"type": "noul", "instructions": instructions}
    described = {key: value for key, value in (criteria or {}).items() if key in ("true", "false") and value}
    if described:
        question["criteria"] = described
    return question


class JevUnavailableError(RuntimeError):
    def __init__(self, code: str, message: str, *, status: int | None = None, request_id: str = ""):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.request_id = request_id


@dataclass(frozen=True)
class JevResponse:
    model: str
    answers: dict[str, dict[str, Any]]
    usage: dict[str, int] = field(default_factory=dict)
    request_id: str = ""
    # Wall time of the whole call, retries included, and how many HTTP attempts it took.
    latency_ms: int = 0
    attempts: int = 1


class JevGateway(Protocol):
    async def system_one(self, state: JevState, questions: Mapping[str, JevQuestion]) -> JevResponse: ...


def _validate_answers(questions: Mapping[str, JevQuestion], payload: Any, request_id: str) -> JevResponse:
    if not isinstance(payload, dict) or not isinstance(payload.get("answers"), dict):
        raise JevUnavailableError("jev_invalid_response", "Jev returned no answers.", request_id=request_id)
    answers: dict[str, dict[str, Any]] = {}
    for question_id, question in questions.items():
        answer = payload["answers"].get(question_id)
        if not isinstance(answer, dict) or answer.get("type") != question["type"]:
            raise JevUnavailableError(
                "jev_invalid_response",
                f"Jev returned no {question['type']} answer for {question_id!r}.",
                request_id=request_id,
            )
        answers[question_id] = answer
    usage = payload.get("usage") if isinstance(payload.get("usage"), dict) else {}
    return JevResponse(
        model=str(payload.get("model") or ""),
        answers=answers,
        usage={key: int(value) for key, value in usage.items() if isinstance(value, (int, float))},
        request_id=request_id,
    )


class HttpJevGateway:
    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        base_url: str = "https://api.typesafe.ai",
        timeout_seconds: float = 20.0,
        max_retries: int = 2,
        retry_delay_seconds: float = 0.4,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self._api_key = api_key.strip()
        self._model = model
        self._base_url = base_url.rstrip("/")
        self._timeout_seconds = timeout_seconds
        self._max_retries = max_retries
        self._retry_delay_seconds = retry_delay_seconds
        self._transport = transport

    async def system_one(self, state: JevState, questions: Mapping[str, JevQuestion]) -> JevResponse:
        if not self._api_key:
            raise JevUnavailableError("jev_missing_api_key", "TYPESAFE_API_KEY is not configured.")
        if not questions:
            raise JevUnavailableError("jev_no_questions", "At least one question is required.")

        body = {"model": self._model, "state": state, "questions": dict(questions)}
        headers = {"Authorization": f"Bearer {self._api_key}", "Accept": "application/json"}
        last_error: JevUnavailableError | None = None
        clock = time.perf_counter()
        async with httpx.AsyncClient(
            base_url=self._base_url,
            timeout=self._timeout_seconds,
            transport=self._transport,
        ) as client:
            for attempt in range(self._max_retries + 1):
                if attempt:
                    await asyncio.sleep(self._retry_delay_seconds * attempt)
                try:
                    response = await client.post(SYSTEM_ONE_PATH, json=body, headers=headers)
                except httpx.TimeoutException:
                    last_error = JevUnavailableError("jev_timeout", "Jev did not respond in time.")
                    continue
                except httpx.TransportError as error:
                    last_error = JevUnavailableError("jev_unreachable", f"Jev is unreachable: {error}")
                    continue

                request_id = response.headers.get(REQUEST_ID_HEADER, "")
                if response.status_code >= 400:
                    last_error = JevUnavailableError(
                        "jev_http_error",
                        f"Jev returned HTTP {response.status_code}: {response.text[:200]}",
                        status=response.status_code,
                        request_id=request_id,
                    )
                    if response.status_code in RETRYABLE_STATUSES:
                        continue
                    raise last_error
                try:
                    payload = response.json()
                except ValueError as error:
                    raise JevUnavailableError(
                        "jev_invalid_response", "Jev returned invalid JSON.", request_id=request_id
                    ) from error
                return replace(
                    _validate_answers(questions, payload, request_id),
                    latency_ms=round((time.perf_counter() - clock) * 1000),
                    attempts=attempt + 1,
                )

        assert last_error is not None
        raise last_error
