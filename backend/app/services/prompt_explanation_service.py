from __future__ import annotations

import asyncio
from typing import Any

from app.core.llm import (
    call_llm_json as _call_llm_json,
    llm_provider_available as _llm_provider_available,
    resolve_available_llm_provider as _resolve_available_llm_provider,
)
from app.core.generator import build_plain_english_prompt_detail
from app.models import CoachPromptToggleExplanationRequest


def _fallback_prompt_toggle_plain_english(body: CoachPromptToggleExplanationRequest) -> str:
    title = str(body.cardTitle or "this card").strip() or "this card"
    prompt = str(body.prompt or "").strip().rstrip(".")
    if prompt:
        return f"{title} asks you to explain what the code is doing in plain English: {prompt}."
    return f"{title} asks you to explain the code in plain English."


async def coach_prompt_toggle_explanation(body: CoachPromptToggleExplanationRequest) -> dict[str, Any]:
    provider = _resolve_available_llm_provider(body.llmProvider)
    if _llm_provider_available(provider):
        system_prompt = (
            "Explain a coding interview practice card in plain English. "
            "Return strict JSON with keys plainEnglish, inputExample, outputExample. "
            "Use one short paragraph for plainEnglish, usually 1 to 2 sentences. "
            "Focus on what the code is doing, not on memorization. "
            "Given the exact code and function name, generate one realistic inputExample and the matching outputExample. "
            "Do not use placeholders, and do not include markdown, bullets, or code fences."
        )
        llm_payload = {
            "cardId": body.cardId,
            "functionName": body.cardTitle,
            "prompt": body.prompt,
            "code": body.target,
            "tags": body.tags,
        }
        llm_response = await asyncio.to_thread(_call_llm_json, system_prompt, llm_payload, provider, 300, 30, 0.2)
        if isinstance(llm_response, dict):
            explanation = str(llm_response.get("plainEnglish", "")).strip()
            input_example = str(llm_response.get("inputExample", "")).strip()
            output_example = str(llm_response.get("outputExample", "")).strip()
            if explanation and input_example and output_example:
                return {
                    "plainEnglish": explanation,
                    "inputExample": input_example,
                    "outputExample": output_example,
                    "llmUsed": True,
                }

    fallback_detail = build_plain_english_prompt_detail(
        pattern=str(body.cardTitle or body.tags[0] if body.tags else "pattern"),
        pattern_slug=str(body.tags[0] if body.tags else ""),
        method="prompt toggle",
        title=str(body.cardTitle or "this card"),
        prompt=str(body.prompt or ""),
        target=str(body.target or ""),
        hint="",
    )
    if fallback_detail:
        return {
            "plainEnglish": str(fallback_detail.get("plainEnglish", "")),
            "inputExample": str(fallback_detail.get("inputExample", "")),
            "outputExample": str(fallback_detail.get("outputExample", "")),
            "llmUsed": False,
        }

    explanation = _fallback_prompt_toggle_plain_english(body)
    return {
        "plainEnglish": explanation,
        "inputExample": f"{str(body.cardTitle or 'function')}(...)",
        "outputExample": "the function's return value",
        "llmUsed": False,
    }
