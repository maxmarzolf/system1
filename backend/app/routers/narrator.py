from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from app.models import CoachAttemptFeedbackRequest, TemplateMode

SUBMISSION_LLM_MAX_RETRIES = 3
SUBMISSION_LLM_RETRY_DELAYS_SECONDS = (0.3, 0.6, 0.9)


class NarratorFeedbackUnavailableError(RuntimeError):
    def __init__(self, code: str, message: str, provider: str, api_error_code: str = ""):
        super().__init__(message)
        self.code = code
        self.message = message
        self.provider = provider
        self.api_error_code = api_error_code


@dataclass(frozen=True)
class NarratorContext:
    provider: str
    provider_label: str
    template_label: str
    submission_tuning: dict[str, Any]


@dataclass(frozen=True)
class NarratorRuntime:
    call_llm_json_for_submission: Callable[[str, dict[str, Any], str], tuple[dict[str, Any] | None, str, str, bool]]
    sleep: Callable[[float], Awaitable[Any]] = asyncio.sleep
    logger: logging.Logger | None = None
    max_retries: int = SUBMISSION_LLM_MAX_RETRIES
    retry_delays_seconds: tuple[float, ...] = SUBMISSION_LLM_RETRY_DELAYS_SECONDS


def narrator_submission_system_prompt(
    template_label: str,
    submission_tuning: dict[str, Any],
) -> str:
    grading_mode = str(submission_tuning.get("gradingMode", "core-logic"))
    grading_instruction = {
        "core-logic": "Focus on whether the core algorithmic logic is sound.",
        "strict": "Grade strictly - every structural detail matters.",
        "lenient": "Focus on intent and overall correctness; minor gaps are acceptable.",
    }.get(grading_mode, "Focus on whether the core algorithmic logic is sound.")

    return (
        f"You are a senior interview coach reviewing a {template_label} solution. "
        "Grade the submission in exactly one sentence in fullFeedback - lead with 'sound', 'close', or 'needs work'. "
        f"{grading_instruction} "
        "Base your diagnosis on the provided assessment signals. "
        "Use correctedVersion only for meaningful structural corrections, never line-by-line rewrites. "
        "Return strict JSON: diagnosis, primaryFocus, immediateCorrection, fullFeedback, correctedVersion, "
        "microDrill, nextRepTarget, strengths (max 3), errorTags. "
        "No markdown fences, no bullet prefixes."
    )


def build_narrator_payload(
    body: CoachAttemptFeedbackRequest,
    assessment: dict[str, Any],
    history: list[dict[str, Any]],
    reveal_expected_answer: bool,
    submission_tuning: dict[str, Any],
) -> dict[str, Any]:
    return {
        "card": {"id": body.cardId, "title": body.cardTitle},
        "attempt": {
            "accuracy": body.accuracy,
            "exact": body.exact,
            "elapsedMs": body.elapsedMs,
            "expectedAnswer": (body.expectedAnswer or "")[:1200] if reveal_expected_answer else "",
            "userAnswer": (body.userAnswer or "")[:1200],
        },
        "assessment": {
            "patternIdentified": assessment.get("patternIdentified", ""),
            "signals": assessment.get("signals", {}),
            "primaryBlocker": assessment.get("primaryBlocker", ""),
            "blockerKey": assessment.get("blockerKey", ""),
            "verdict": assessment.get("verdict", "needs-work"),
            "errorTags": assessment.get("errorTags", []),
            "strengths": assessment.get("strengths", []),
        },
        "skillTags": body.skillTags,
        "historicalAttempts": [
            {
                "accuracy": item.get("accuracy", 0),
                "exact": item.get("exact", False),
                "templateMode": item.get("templateMode", TemplateMode.algorithm.value),
                "errorTags": item.get("submissionFeedback", {}).get("errorTags", [])
                if isinstance(item.get("submissionFeedback"), dict)
                else [],
                "primaryFocus": item.get("submissionFeedback", {}).get("primaryFocus", "")
                if isinstance(item.get("submissionFeedback"), dict)
                else "",
                "createdAt": item.get("createdAt", ""),
            }
            for item in history[:8]
        ],
        "submissionTuning": submission_tuning,
    }


def _has_narrator_content(llm_response: dict[str, Any] | None) -> bool:
    if not isinstance(llm_response, dict):
        return False
    return any(
        key in llm_response and str(llm_response.get(key, "")).strip()
        for key in ("fullFeedback", "diagnosis", "primaryFocus", "immediateCorrection")
    )


async def attempt_feedback_with_narrator(
    body: CoachAttemptFeedbackRequest,
    assessment: dict[str, Any],
    history: list[dict[str, Any]],
    history_summary: dict[str, Any],
    context: NarratorContext,
    runtime: NarratorRuntime,
) -> dict[str, Any]:
    """Submission-only Narrator path. Calls LLM with the Assessor output as structured context."""
    del history_summary

    system_prompt = narrator_submission_system_prompt(
        context.template_label,
        context.submission_tuning,
    )
    llm_payload = build_narrator_payload(
        body,
        assessment,
        history,
        True,
        context.submission_tuning,
    )

    llm_response: dict[str, Any] | None = None
    last_error_code = ""
    last_error_message = ""

    for attempt in range(1, runtime.max_retries + 1):
        llm_response, error_code, error_message, retryable = await asyncio.to_thread(
            runtime.call_llm_json_for_submission,
            system_prompt,
            llm_payload,
            context.provider,
        )
        if _has_narrator_content(llm_response):
            break

        last_error_code = error_code
        last_error_message = error_message
        if runtime.logger:
            runtime.logger.warning(
                "Submission feedback LLM attempt %s/%s failed for provider '%s'.",
                attempt,
                runtime.max_retries,
                context.provider,
            )
        if attempt < runtime.max_retries and retryable:
            await runtime.sleep(runtime.retry_delays_seconds[attempt - 1])
        elif attempt < runtime.max_retries and not retryable:
            break

    if not _has_narrator_content(llm_response):
        fallback_message = (
            last_error_message
            or f"Feedback cannot be generated at this time. No response from {context.provider_label}."
        )
        raise NarratorFeedbackUnavailableError(
            code="submission_feedback_no_response",
            message=fallback_message,
            provider=context.provider,
            api_error_code=last_error_code,
        )

    corrected_version = str(llm_response.get("correctedVersion", "")).strip()
    corrected_version = corrected_version.removeprefix("```python").removeprefix("```").removesuffix("```").strip()

    return {
        "diagnosis": str(llm_response.get("diagnosis", assessment.get("primaryBlocker", ""))),
        "primaryFocus": str(llm_response.get("primaryFocus", f"Fix {assessment.get('blockerKey', 'the primary miss')}.")),
        "immediateCorrection": str(llm_response.get("immediateCorrection", "")),
        "keepInMind": str(llm_response.get("keepInMind", "")),
        "affirmation": str(llm_response.get("affirmation", "")),
        "nextMove": str(llm_response.get("nextMove", "")),
        "why": str(llm_response.get("why", "")),
        "microDrill": str(llm_response.get("microDrill", "")),
        "nextRepTarget": str(llm_response.get("nextRepTarget", "")),
        "strengths": [str(x) for x in llm_response.get("strengths", assessment.get("strengths", []))][:3],
        "errorTags": [str(x) for x in llm_response.get("errorTags", assessment.get("errorTags", []))][:6],
        "fullFeedback": str(llm_response.get("fullFeedback", "")),
        "correctedVersion": corrected_version,
        "llmUsed": True,
    }
