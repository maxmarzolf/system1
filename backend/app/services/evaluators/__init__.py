"""Submission evaluators, one per modality. Importing a module registers it."""

from app.services.evaluators import jev_mcq, legacy_recall  # noqa: F401  (register evaluators)
from app.services.evaluators.base import EvaluationOutcome, SubmissionEvaluator, SubmissionRecord
from app.services.evaluators.registry import EVALUATORS, get_evaluator, register_evaluator

__all__ = [
    "EVALUATORS",
    "EvaluationOutcome",
    "SubmissionEvaluator",
    "SubmissionRecord",
    "get_evaluator",
    "register_evaluator",
]
