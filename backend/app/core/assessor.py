from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from app.models import CoachAttemptFeedbackRequest


class AssessorUnavailableError(RuntimeError):
    def __init__(self, code: str, message: str, provider: str, api_error_code: str = ""):
        super().__init__(message)
        self.code = code
        self.message = message
        self.provider = provider
        self.api_error_code = api_error_code


@dataclass(frozen=True)
class AssessorContext:
    provider: str
    provider_label: str
    template_mode: str


@dataclass(frozen=True)
class AssessorRuntime:
    call_llm_json: Callable[[str, dict[str, Any], str, int, int, float], dict[str, Any] | None]
    max_tokens: int
    logger: logging.Logger | None = None


def assessor_system_prompt(live_mode: bool) -> str:
    signals_spec = (
        "signals: {"
        "structure: {score: 0-100, note: str}, "
        "correctness: {score: 0-100, note: str}, "
        "completeness: {score: 0-100, note: str}, "
        "patternFidelity: {score: 0-100, note: str}, "
        "syntax: {valid: bool, error: str|null}, "
        "completionTime: {score: 0-100, note: str}"
        "}"
    )
    base = (
        "You are a coding pattern analyst. Analyze the provided answer against the expected answer. "
        f"Return strict JSON: {{v: 1, patternIdentified: str, {signals_spec}, "
        "structuralElements: {hasSignature: bool, hasLoop: bool, hasShrinkStep: bool, hasScoreUpdate: bool, hasGuard: bool}, "
        "primaryBlocker: str, blockerKey: str, verdict: 'sound'|'close'|'needs-work', "
        "errorTags: str[], strengths: str[]"
    )
    if live_mode:
        return (
            base
            + ", diagnosis: str, primaryFocus: str, immediateCorrection: str, "
            "affirmation: str, nextMove: str, why: str, keepInMind: str, "
            "microDrill: str, nextRepTarget: str}. "
            "All narrative string fields must be 20 words or fewer. "
            "Focus on one structural blocker only. "
            "Leave affirmation empty unless something concrete is already correct. "
            "Return only valid JSON. Do not include markdown."
        )
    return base + "}. Structural assessment only - no narrative fields. Return only valid JSON. Do not include markdown."


async def run_signal_assessor(
    body: CoachAttemptFeedbackRequest,
    context: AssessorContext,
    runtime: AssessorRuntime,
) -> dict[str, Any]:
    """Call the Signal Assessor LLM selected by the request."""
    system_prompt = assessor_system_prompt(body.liveMode)
    payload = {
        "skillTags": body.skillTags,
        "templateMode": context.template_mode,
        "userAnswer": (body.userAnswer or "")[:800],
        "expectedAnswer": (body.expectedAnswer or "")[:800],
        "elapsedMs": body.elapsedMs,
        "precomputedAccuracy": body.accuracy,
    }

    result = await asyncio.to_thread(
        runtime.call_llm_json,
        system_prompt,
        payload,
        context.provider,
        runtime.max_tokens,
        30,
        0.2,
    )

    if not isinstance(result, dict):
        if runtime.logger:
            runtime.logger.warning("Signal assessor returned non-dict response from provider '%s'.", context.provider)
        raise AssessorUnavailableError(
            code="signal_assessor_no_response",
            message=f"Signal assessment cannot be generated at this time. No response from {context.provider_label}.",
            provider=context.provider,
            api_error_code="provider_empty_response",
        )

    required_keys = {"v", "patternIdentified", "signals", "primaryBlocker", "blockerKey", "verdict", "errorTags", "strengths"}
    if body.liveMode:
        required_keys |= {"diagnosis", "primaryFocus", "immediateCorrection", "nextMove", "why", "microDrill", "nextRepTarget"}
    missing = required_keys - result.keys()
    if missing or not isinstance(result.get("signals"), dict):
        if runtime.logger:
            runtime.logger.warning("Signal assessor response missing keys %s from provider '%s'.", missing, context.provider)
        raise AssessorUnavailableError(
            code="signal_assessor_invalid_response",
            message=f"Signal assessment cannot be generated at this time. Invalid response from {context.provider_label}.",
            provider=context.provider,
            api_error_code="provider_invalid_json",
        )

    result["llmUsed"] = True
    return result


def assessment_to_live_response(assessment: dict[str, Any]) -> dict[str, Any]:
    strengths = [str(s) for s in assessment.get("strengths", [])[:3]]
    primary_blocker = str(assessment.get("primaryBlocker", ""))
    blocker_key = str(assessment.get("blockerKey", "primary gap"))
    return {
        "diagnosis": str(assessment.get("diagnosis", primary_blocker)),
        "primaryFocus": str(assessment.get("primaryFocus", f"Fix {blocker_key}.")),
        "immediateCorrection": str(assessment.get("immediateCorrection", primary_blocker)),
        "affirmation": str(assessment.get("affirmation", strengths[0] if strengths else "")),
        "nextMove": str(assessment.get("nextMove", primary_blocker)),
        "why": str(assessment.get("why", "")),
        "keepInMind": str(assessment.get("keepInMind", "")),
        "microDrill": str(assessment.get("microDrill", "")),
        "nextRepTarget": str(assessment.get("nextRepTarget", "")),
        "strengths": strengths,
        "errorTags": [str(t) for t in assessment.get("errorTags", [])[:6]],
        "fullFeedback": "",
        "correctedVersion": "",
        "llmUsed": bool(assessment.get("llmUsed", True)),
    }
