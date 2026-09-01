from __future__ import annotations

import asyncio
import logging

from app.core.assessor import (
    AssessorContext,
    AssessorRuntime,
    AssessorUnavailableError,
    assessment_to_live_response,
    run_signal_assessor,
)
from app.core.generator import _template_mode_value
from app.core.llm import (
    call_llm_json as _call_llm_json,
    llm_provider_available as _llm_provider_available,
    llm_provider_label as _llm_provider_label,
    resolve_available_llm_provider as _resolve_available_llm_provider,
)
from app.core.narrator import (
    NarratorContext,
    NarratorFeedbackUnavailableError,
    NarratorRuntime,
    attempt_feedback_with_narrator,
)
from app.core.submission_llm_client import call_llm_json_for_submission
from app.domain.coach_context import algorithmic_template_label as _domain_algorithmic_template_label
from app.domain.feedback_builder import submission_rubric_from_assessment as _domain_submission_rubric_from_assessment
from app.domain.llm_resilience import (
    SubmissionFeedbackUnavailableError,
)
from app.domain.template_evaluator import merged_submission_tuning as _domain_merged_submission_tuning
from app.models import CoachAttemptFeedbackRequest, CoachAttemptFeedbackResponse
from app.services.contracts import FeedbackPayload, HistoryEntry, HistorySummary
from app.services import history_service

logger = logging.getLogger(__name__)

ASSESSOR_RUNTIME = AssessorRuntime(
    call_llm_json=_call_llm_json,
    max_tokens=600,
    logger=logger,
)

NARRATOR_RUNTIME = NarratorRuntime(
    call_llm_json_for_submission=call_llm_json_for_submission,
    sleep=asyncio.sleep,
    logger=logger,
)


def _resolve_feedback_provider(body: CoachAttemptFeedbackRequest) -> str:
    provider = _resolve_available_llm_provider(body.llmProvider)
    if not _llm_provider_available(provider):
        raise SubmissionFeedbackUnavailableError(
            code="coach_llm_missing_api_key",
            message="Update backend .env with at least one coach LLM API key.",
            provider=provider,
            api_error_code="provider_auth_error",
        )
    return provider


async def _run_assessor_phase(
    body: CoachAttemptFeedbackRequest,
    provider: str,
    template_mode: str,
) -> FeedbackPayload:
    assessor_context = AssessorContext(
        provider=provider,
        provider_label=_llm_provider_label(provider),
        template_mode=template_mode,
    )
    try:
        return await run_signal_assessor(body, assessor_context, ASSESSOR_RUNTIME)
    except AssessorUnavailableError as error:
        raise SubmissionFeedbackUnavailableError(
            code=error.code,
            message=error.message,
            provider=error.provider,
            api_error_code=error.api_error_code,
        ) from error


async def _run_submission_narrator_phase(
    body: CoachAttemptFeedbackRequest,
    assessment: FeedbackPayload,
    history: list[HistoryEntry],
    history_summary: HistorySummary,
    provider: str,
    template_mode: str,
) -> FeedbackPayload:
    narrator_context = NarratorContext(
        provider=provider,
        provider_label=_llm_provider_label(provider),
        template_label=_domain_algorithmic_template_label(body.skillTags, template_mode),
        submission_tuning=_domain_merged_submission_tuning(body.submissionTuning),
    )
    try:
        feedback = await attempt_feedback_with_narrator(
            body,
            assessment,
            history,
            history_summary,
            narrator_context,
            NARRATOR_RUNTIME,
        )
    except NarratorFeedbackUnavailableError as error:
        raise SubmissionFeedbackUnavailableError(
            code=error.code,
            message=error.message,
            provider=error.provider,
            api_error_code=error.api_error_code,
        ) from error

    if not bool(feedback.get("llmUsed")):
        raise SubmissionFeedbackUnavailableError(
            code="submission_feedback_no_response",
            message=f"Feedback cannot be generated at this time. No response from {_llm_provider_label(provider)}.",
            provider=provider,
            api_error_code="provider_empty_response",
        )
    return feedback


def _finalize_feedback_payload(
    body: CoachAttemptFeedbackRequest,
    assessment: FeedbackPayload,
    feedback: FeedbackPayload,
    provider: str,
) -> CoachAttemptFeedbackResponse:
    if not body.liveMode:
        feedback["submissionRubric"] = _domain_submission_rubric_from_assessment(body, assessment)
    feedback["llmProvider"] = provider if bool(feedback.get("llmUsed")) else ""
    feedback.pop("signals", None)
    return CoachAttemptFeedbackResponse.model_validate(feedback)


async def coach_attempt_feedback(body: CoachAttemptFeedbackRequest) -> CoachAttemptFeedbackResponse:
    history, history_summary = await history_service.load_feedback_context(body)
    provider = _resolve_feedback_provider(body)
    template_mode = _template_mode_value(body.templateMode)
    assessment = await _run_assessor_phase(body, provider, template_mode)

    if body.liveMode:
        feedback = assessment_to_live_response(assessment)
    else:
        feedback = await _run_submission_narrator_phase(
            body,
            assessment,
            history,
            history_summary,
            provider,
            template_mode,
        )

    feedback = _finalize_feedback_payload(body, assessment, feedback, provider)
    return feedback
