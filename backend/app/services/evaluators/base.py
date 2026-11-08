"""Evaluator contract: given a submission, decide success and produce its evaluation.

One evaluator is registered per modality. ``submission_service`` only looks up
the evaluator and persists what it returns, so moving a modality to Jev means
registering a different evaluator, with no endpoint, persistence or UI change.
"""

from __future__ import annotations

from typing import Protocol

from app.contracts.submission import EvaluationOutcome, SubmissionRecord
from app.models import AttemptCreate

__all__ = ["EvaluationOutcome", "SubmissionEvaluator", "SubmissionRecord"]


class SubmissionEvaluator(Protocol):
    name: str

    async def evaluate(self, body: AttemptCreate) -> EvaluationOutcome: ...
