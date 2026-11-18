"""Steps 3 and 4 of the pipeline: ask Jev.

Pass 1 asks the correctness question (when the directive's source is ``jev``) plus every Jev
signal that doesn't need correctness. Pass 2 asks the ``needs_correctness`` signals, with
``answeredCorrectly`` added to the state. A pass with no questions makes no call, so a spec
with deterministic correctness and no Jev signals (ghost reps) never calls Jev.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from app.core.jev import JevGateway, JevQuestion, JevResponse, JevUnavailableError
from app.core.signals import CORRECTNESS_QUESTION_ID, ModalitySignalSpec
from app.services.evaluation.context import SubmissionContext


@dataclass
class JevExchange:
    """What Jev answered across both passes, and what went wrong."""

    answers: dict[str, dict[str, Any]] = field(default_factory=dict)
    traces: list[dict[str, Any]] = field(default_factory=list)
    responses: list[JevResponse] = field(default_factory=list)
    first_pass_error: JevUnavailableError | None = None
    second_pass_error: JevUnavailableError | None = None

    @property
    def called(self) -> bool:
        return bool(self.traces) or self.first_pass_error is not None

    @property
    def correctness(self) -> dict[str, Any] | None:
        return self.answers.get(CORRECTNESS_QUESTION_ID)


def _trace(response: JevResponse, questions: dict[str, JevQuestion], state: Any) -> dict[str, Any]:
    """One Jev call as sent and received: the state and full questions in, the answers out."""
    return {
        "model": response.model,
        "requestId": response.request_id,
        "usage": response.usage,
        "latencyMs": response.latency_ms,
        "attempts": response.attempts,
        "state": state,
        "questions": questions,
        "questionIds": list(questions),
        "answers": response.answers,
    }


def first_pass_questions(spec: ModalitySignalSpec, context: SubmissionContext) -> dict[str, JevQuestion]:
    signal_context = context.signal_context()
    questions: dict[str, JevQuestion] = {}
    if spec.correctness.source == "jev":
        questions[CORRECTNESS_QUESTION_ID] = spec.correctness.question()
    for plugin, _weight in spec.plugins():
        if plugin.needs_correctness:
            continue
        question = plugin.question(signal_context)
        if question is not None:
            questions[plugin.key] = question
    return questions


def second_pass_questions(spec: ModalitySignalSpec, context: SubmissionContext) -> dict[str, JevQuestion]:
    signal_context = context.signal_context()
    questions: dict[str, JevQuestion] = {}
    for plugin, _weight in spec.plugins():
        if plugin.needs_correctness:
            question = plugin.question(signal_context)
            if question is not None:
                questions[plugin.key] = question
    return questions


class JevAsker:
    """Runs both passes for one submission. The gateway is created lazily, so a submission
    that needs no Jev call never needs a key either."""

    def __init__(self, gateway_factory: Callable[[], JevGateway]):
        self._gateway_factory = gateway_factory
        self._gateway: JevGateway | None = None

    async def _ask(self, state: Any, questions: dict[str, JevQuestion], exchange: JevExchange) -> None:
        if self._gateway is None:
            self._gateway = self._gateway_factory()
        response = await self._gateway.system_one(state, questions)
        exchange.answers.update(response.answers)
        exchange.responses.append(response)
        exchange.traces.append(_trace(response, questions, state))

    async def first_pass(self, spec: ModalitySignalSpec, context: SubmissionContext) -> JevExchange:
        exchange = JevExchange()
        questions = first_pass_questions(spec, context)
        if not questions:
            return exchange
        try:
            await self._ask(context.state, questions, exchange)
        except JevUnavailableError as error:
            exchange.first_pass_error = error
        return exchange

    async def second_pass(self, spec: ModalitySignalSpec, context: SubmissionContext, exchange: JevExchange, successful: bool) -> None:
        if exchange.first_pass_error is not None:
            return
        questions = second_pass_questions(spec, context)
        if not questions:
            return
        try:
            await self._ask({**context.state, "answeredCorrectly": 1 if successful else 0}, questions, exchange)
        except JevUnavailableError as error:
            exchange.second_pass_error = error
