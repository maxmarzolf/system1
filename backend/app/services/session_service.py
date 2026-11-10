from __future__ import annotations

import asyncio

from app.core.llm import (
    LlmUnavailableError,
    call_llm_json as _call_llm_json,
    llm_provider_label as _llm_provider_label,
    require_available_provider,
)
from app.models import CoachSessionPlanRequest, CoachSessionPlanResponse


async def coach_session_plan(body: CoachSessionPlanRequest) -> CoachSessionPlanResponse:
    provider = require_available_provider(body.llmProvider)

    system_prompt = (
        "You are a training coach building practical next-session plans for recall training. "
        "Return strict JSON with keys: headline, focusTheme, warmup, mainSet, cooldown, note."
    )
    llm_payload = {
        "session": {
            "mode": body.mode.value,
            "questionType": body.questionType,
            "orderType": body.orderType,
            "attempts": body.attempts,
            "correctCount": body.correctCount,
            "avgElapsedMs": body.avgElapsedMs,
        },
        "weakestCards": [c.model_dump() for c in body.weakestCards[:5]],
    }

    llm_response = await asyncio.to_thread(_call_llm_json, system_prompt, llm_payload, provider)
    if not llm_response:
        raise LlmUnavailableError(
            code="coach_llm_no_response",
            message=f"Session plan cannot be generated at this time. No response from {_llm_provider_label(provider)}.",
            provider=provider,
            api_error_code="provider_empty_response",
        )

    required = ["headline", "focusTheme", "warmup", "mainSet", "cooldown", "note"]
    if any(key not in llm_response for key in required):
        raise LlmUnavailableError(
            code="coach_llm_invalid_response",
            message=f"Session plan cannot be generated at this time. Invalid response from {_llm_provider_label(provider)}.",
            provider=provider,
            api_error_code="provider_invalid_json",
        )

    return CoachSessionPlanResponse(
        headline=str(llm_response["headline"]),
        focusTheme=str(llm_response["focusTheme"]),
        warmup=str(llm_response["warmup"]),
        mainSet=str(llm_response["mainSet"]),
        cooldown=str(llm_response["cooldown"]),
        note=str(llm_response["note"]),
        llmUsed=True,
    )
