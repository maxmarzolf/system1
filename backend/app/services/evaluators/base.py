"""Evaluator contract: given a submission, decide success and produce its evaluation.

One evaluator is registered per modality. ``submission_service`` only looks up
the evaluator and persists what it returns, so moving a modality to Jev means
registering a different evaluator, with no endpoint, persistence or UI change.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from app.models import AttemptCreate


@dataclass(frozen=True)
class SubmissionRecord:
    """Server-trusted values to persist in place of what the client sent."""

    user_answer: str
    correct_answer: str
    multiple_choice_problem_id: str | None = None


@dataclass(frozen=True)
class EvaluationOutcome:
    successful: bool
    evaluation: dict[str, Any]
    feedback_unavailable: dict[str, Any] | None = None
    record: SubmissionRecord | None = None


class SubmissionEvaluator(Protocol):
    name: str

    async def evaluate(self, body: AttemptCreate) -> EvaluationOutcome: ...
