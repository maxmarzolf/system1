from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from app.core.signal_catalog import SignalDefinition, SignalSpec
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


def _signal_shape(signal: SignalDefinition) -> str:
    if signal.kind == "boolean":
        return f"{signal.key}: {{valid: bool, error: str|null}}"
    return f"{signal.key}: {{score: 0-100, note: str}}"


def assessor_system_prompt(spec: SignalSpec) -> str:
    signals_shape = "signals: {" + ", ".join(_signal_shape(signal) for signal in spec.signals) + "}"
    structural_shape = "structuralElements: {" + ", ".join(f"{name}: bool" for name in spec.structural_elements) + "}"
    blocker_keys = " | ".join(f"'{key}'" for key in spec.keys)
    return (
        "You are a coding pattern analyst. Analyze the provided answer against the expected answer. "
        "Score every signal using signalGuidance as the definition of what that signal measures. "
        f"Return strict JSON: {{v: 1, patternIdentified: str, {signals_shape}, {structural_shape}, "
        f"primaryBlocker: str, blockerKey: {blocker_keys}, verdict: 'sound'|'close'|'needs-work', "
        "errorTags: str[], strengths: str[]}. "
        "blockerKey names the weakest signal. "
        "Structural assessment only - no narrative fields. Return only valid JSON. Do not include markdown."
    )


async def run_signal_assessor(
    body: CoachAttemptFeedbackRequest,
    context: AssessorContext,
    runtime: AssessorRuntime,
    spec: SignalSpec,
) -> dict[str, Any]:
    """Call the Signal Assessor LLM selected by the request, scoring the signals in ``spec``."""
    payload = {
        "skillTags": body.skillTags,
        "templateMode": context.template_mode,
        "userAnswer": (body.userAnswer or "")[:800],
        "expectedAnswer": (body.expectedAnswer or "")[:800],
        "elapsedMs": body.elapsedMs,
        "precomputedSound": body.exact,
        "signalGuidance": {signal.key: signal.guidance for signal in spec.signals},
    }

    result = await asyncio.to_thread(
        runtime.call_llm_json,
        assessor_system_prompt(spec),
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
    missing = required_keys - result.keys()
    signals = result.get("signals")
    missing_signals = set(spec.keys) - signals.keys() if isinstance(signals, dict) else set(spec.keys)
    if missing or missing_signals:
        if runtime.logger:
            runtime.logger.warning(
                "Signal assessor response missing keys %s and signals %s from provider '%s'.",
                missing,
                missing_signals,
                context.provider,
            )
        raise AssessorUnavailableError(
            code="signal_assessor_invalid_response",
            message=f"Signal assessment cannot be generated at this time. Invalid response from {context.provider_label}.",
            provider=context.provider,
            api_error_code="provider_invalid_json",
        )

    result["llmUsed"] = True
    return result
