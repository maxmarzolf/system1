from __future__ import annotations

from typing import Any

from app.domain.llm_resilience import SubmissionFeedbackUnavailableError
from app.domain.submission_evaluation import outcome_evaluation
from app.models import AttemptCreate, CoachAttemptEvaluationRequest, CoachAttemptFeedbackRequest
from app.services import attempts_service, evaluation_service, feedback_service


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
        enabledTemplateModes=[body.templateMode],
        liveMode=False,
        submissionTuning=body.submissionTuning,
        llmProvider=body.llmProvider,
    )


async def _fallback_recall_evaluation(body: AttemptCreate) -> dict[str, Any]:
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
        llm_used=bool(result.get("llmUsed")),
        provider=body.llmProvider,
        source="semantic-evaluator",
    )


async def create_submission(body: AttemptCreate) -> dict[str, Any]:
    feedback_unavailable: dict[str, Any] | None = None

    if body.activityFormat == "multiple-choice":
        successful = (body.userAnswer or "").strip() == (body.correctAnswer or "").strip()
        evaluation = outcome_evaluation(successful, source="multiple-choice-answer-key")
    elif body.supportLayer.value == "ghost-reps":
        evaluation = await _fallback_recall_evaluation(body)
        successful = evaluation["verdict"] == "sound"
    else:
        try:
            evaluation = await feedback_service.coach_submission_evaluation(_feedback_request(body))
        except SubmissionFeedbackUnavailableError as error:
            evaluation = await _fallback_recall_evaluation(body)
            feedback_unavailable = {
                "code": error.code,
                "message": error.message,
                "provider": error.provider,
            }
        successful = evaluation["verdict"] == "sound"

    saved = await attempts_service.create_attempt(
        body,
        successful=successful,
        evaluation=evaluation,
    )
    return {
        **saved,
        "successful": successful,
        "evaluation": evaluation,
        "feedbackUnavailable": feedback_unavailable,
    }
