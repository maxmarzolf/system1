"""Recall modalities on the pre-Jev pipeline, behind the evaluator contract.

Ghost-rep uses the deterministic/semantic grader; total-recall and microdrill
use the Signal Assessor and Narrator, falling back to the semantic grader.
"""

from __future__ import annotations

from typing import Any

from app.core.signal_catalog import SignalSpec
from app.core.llm import LlmUnavailableError
from app.contracts.evaluation import Evaluation, outcome_evaluation
from app.models import AttemptCreate, CoachAttemptEvaluationRequest, CoachAttemptFeedbackRequest
from app.services import evaluation_service, feedback_service, signal_spec_service
from app.contracts.submission import EvaluationOutcome


def _feedback_request(body: AttemptCreate) -> CoachAttemptFeedbackRequest:
    return CoachAttemptFeedbackRequest(
        cardId=body.cardId,
        cardTitle=body.cardTitle or "",
        prompt=body.question or "",
        expectedAnswer=body.correctAnswer or "",
        userAnswer=body.userAnswer or "",
        elapsedMs=body.elapsedMs,
        exact=False,
        interactionId=body.interactionId,
        questionType=body.questionType,
        skillTags=body.categoryTags,
        mode=body.mode,
        templateMode=body.templateMode,
        submissionTuning=body.submissionTuning,
        llmProvider=body.llmProvider,
    )


async def _semantic_evaluation(body: AttemptCreate, spec: SignalSpec) -> Evaluation:
    result = await evaluation_service.coach_attempt_evaluation(
        CoachAttemptEvaluationRequest(
            cardTitle=body.cardTitle or "",
            prompt=body.question or "",
            expectedAnswer=body.correctAnswer or "",
            userAnswer=body.userAnswer or "",
            skillTags=body.categoryTags,
            templateMode=body.templateMode,
            submissionTuning=body.submissionTuning,
            llmProvider=body.llmProvider,
        )
    )
    return outcome_evaluation(
        bool(result.get("sound")),
        spec,
        llm_used=bool(result.get("llmUsed")),
        provider=body.llmProvider,
        source="semantic-evaluator",
    )


async def _resolve_spec(body: AttemptCreate) -> SignalSpec:
    return await signal_spec_service.resolve_signal_spec([body.generatedCardId, body.cardId], body.categoryTags)


class GhostRepEvaluator:
    name = "semantic-recall"

    async def evaluate(self, body: AttemptCreate) -> EvaluationOutcome:
        evaluation = await _semantic_evaluation(body, await _resolve_spec(body))
        return EvaluationOutcome(successful=evaluation.sound, evaluation=evaluation)


class AssessorEvaluator:
    name = "assessor-narrator"

    async def evaluate(self, body: AttemptCreate) -> EvaluationOutcome:
        spec = await _resolve_spec(body)
        feedback_unavailable: dict[str, Any] | None = None
        try:
            evaluation = await feedback_service.coach_submission_evaluation(_feedback_request(body), spec)
        except LlmUnavailableError as error:
            evaluation = await _semantic_evaluation(body, spec)
            feedback_unavailable = {
                "code": error.code,
                "message": error.message,
                "provider": error.provider,
            }
        return EvaluationOutcome(
            successful=evaluation.sound,
            evaluation=evaluation,
            feedback_unavailable=feedback_unavailable,
        )

