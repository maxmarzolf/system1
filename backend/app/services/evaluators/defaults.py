"""The default evaluator for each modality, registered by the app factory.

Swapping how a modality is graded means changing one line here, or registering a
different evaluator before the app is built (an explicit registration wins over the
default); nothing else in the backend changes.
"""

from __future__ import annotations

from app.models import SubmissionModality
from app.services.evaluators.base import SubmissionEvaluator
from app.services.evaluators.jev_mcq import JevMcqEvaluator
from app.services.evaluators.legacy_recall import AssessorEvaluator, GhostRepEvaluator
from app.services.evaluators.registry import EVALUATORS, register_evaluator


def default_evaluators() -> dict[SubmissionModality, SubmissionEvaluator]:
    assessor = AssessorEvaluator()
    return {
        SubmissionModality.mcq: JevMcqEvaluator(),
        SubmissionModality.ghost_rep: GhostRepEvaluator(),
        SubmissionModality.total_recall: assessor,
        SubmissionModality.microdrill: assessor,
    }


def register_default_evaluators() -> None:
    """Register the default for every modality that has no evaluator yet."""
    for modality, evaluator in default_evaluators().items():
        if modality not in EVALUATORS:
            register_evaluator(evaluator, modality)
