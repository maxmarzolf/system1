from __future__ import annotations

from app.models import SubmissionModality
from app.services.evaluators.base import SubmissionEvaluator

EVALUATORS: dict[SubmissionModality, SubmissionEvaluator] = {}


def register_evaluator(evaluator: SubmissionEvaluator, *modalities: SubmissionModality) -> SubmissionEvaluator:
    for modality in modalities:
        EVALUATORS[modality] = evaluator
    return evaluator


def get_evaluator(modality: SubmissionModality) -> SubmissionEvaluator:
    try:
        return EVALUATORS[modality]
    except KeyError as error:
        raise LookupError(f"No evaluator registered for modality {modality.value!r}.") from error
