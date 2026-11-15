"""Step 8 of the pipeline (optional): written feedback from Jev's results.

Runs only for the modalities the grading settings name. It never changes the grade; when it
fails, the evaluation still stands, without prose, and the failure is flagged.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from app.core.feedback_writer import SYSTEM_PROMPT, feedback_payload, validated_feedback
from app.core.llm import CallJson, LlmCall, call_llm_json_with, llm_provider_available, resolve_available_llm_provider
from app.core.signals import SignalResult
from app.services.evaluation.context import SubmissionContext

FEEDBACK_CALL = LlmCall(max_tokens=1200, timeout_seconds=30, temperature=0.3)


@dataclass(frozen=True)
class FeedbackResult:
    feedback: dict[str, Any]
    provider: str = ""
    error: str = ""


def _signal_summary(results: dict[str, SignalResult]) -> list[dict[str, Any]]:
    return [
        {"key": r.key, "label": r.label, "role": r.role, "score": r.score, "raw": r.raw, "note": r.note}
        for r in results.values()
        if r.status == "scored"
    ]


async def write_feedback(
    context: SubmissionContext,
    *,
    verdict: str,
    successful: bool,
    results: dict[str, SignalResult],
    requested_provider: str,
    call_json: CallJson = call_llm_json_with,
    provider_resolver: Callable[[str], str] = resolve_available_llm_provider,
) -> FeedbackResult:
    provider = provider_resolver(requested_provider)
    if not llm_provider_available(provider):
        return FeedbackResult({}, error="feedback_unavailable")
    payload = feedback_payload(
        modality=context.modality,
        state=context.state,
        verdict=verdict,
        successful=successful,
        signals=_signal_summary(results),
        overrides=list(context.overrides),
    )
    reply = await asyncio.to_thread(call_json, SYSTEM_PROMPT, payload, provider, FEEDBACK_CALL)
    feedback = validated_feedback(reply)
    if feedback is None:
        return FeedbackResult({}, provider=provider, error="feedback_unavailable")
    return FeedbackResult(feedback, provider=provider)
