from __future__ import annotations

import asyncio
import logging

from app.core.assessor import AssessorContext, AssessorRuntime, run_signal_assessor
from app.core.generator import template_mode_value
from app.core.llm import (
    LlmUnavailableError,
    call_llm_json as _call_llm_json,
    call_llm_json_for_submission,
    llm_provider_label as _llm_provider_label,
    require_available_provider,
)
from app.core.narrator import NarratorContext, NarratorRuntime, attempt_feedback_with_narrator
from app.core.signal_catalog import SignalSpec
from app.domain.coach_context import algorithmic_template_label as _domain_algorithmic_template_label
from app.domain.feedback_builder import submission_rubric_from_assessment as _domain_submission_rubric_from_assessment
from app.contracts.evaluation import Evaluation, build_evaluation
from app.domain.recall_soundness import merged_submission_tuning as _domain_merged_submission_tuning
from app.models import CoachAttemptFeedbackRequest
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


async def _run_assessor_phase(
    body: CoachAttemptFeedbackRequest,
    provider: str,
    template_mode: str,
    spec: SignalSpec,
) -> FeedbackPayload:
    assessor_context = AssessorContext(
        provider=provider,
        provider_label=_llm_provider_label(provider),
        template_mode=template_mode,
    )
    return await run_signal_assessor(body, assessor_context, ASSESSOR_RUNTIME, spec)


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
    feedback = await attempt_feedback_with_narrator(
        body,
        assessment,
        history,
        history_summary,
        narrator_context,
        NARRATOR_RUNTIME,
    )

    if not bool(feedback.get("llmUsed")):
        raise LlmUnavailableError(
            code="submission_feedback_no_response",
            message=f"Feedback cannot be generated at this time. No response from {_llm_provider_label(provider)}.",
            provider=provider,
            api_error_code="provider_empty_response",
        )
    return feedback


async def coach_submission_evaluation(body: CoachAttemptFeedbackRequest, spec: SignalSpec) -> Evaluation:
    history, history_summary = await history_service.load_feedback_context(body)
    provider = require_available_provider(body.llmProvider)
    template_mode = template_mode_value(body.templateMode)
    assessment = await _run_assessor_phase(body, provider, template_mode, spec)
    sound = str(assessment.get("verdict") or "").strip() == "sound"
    evaluated_body = body.model_copy(update={"exact": sound})
    feedback = await _run_submission_narrator_phase(
        evaluated_body,
        assessment,
        history,
        history_summary,
        provider,
        template_mode,
    )
    rubric = _domain_submission_rubric_from_assessment(evaluated_body, assessment, spec)
    return build_evaluation(
        rubric,
        spec,
        feedback,
        provider=provider,
        llm_used=bool(feedback.get("llmUsed")),
    )
