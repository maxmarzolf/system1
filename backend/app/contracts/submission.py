"""What an evaluator hands back for a submission, independent of how it graded it."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.contracts.evaluation import Evaluation


@dataclass(frozen=True)
class SubmissionRecord:
    """Server-trusted values to persist in place of what the client sent."""

    user_answer: str
    correct_answer: str
    multiple_choice_problem_id: str | None = None


@dataclass(frozen=True)
class EvaluationOutcome:
    successful: bool
    evaluation: Evaluation
    feedback_unavailable: dict[str, Any] | None = None
    record: SubmissionRecord | None = None
