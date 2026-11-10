"""Submission evaluators, one per modality. ``register_default_evaluators`` wires them up."""

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
