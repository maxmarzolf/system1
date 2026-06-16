from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

from app.core.generator import (
    _clean_concise_prompt,
    _core_shape_template_target,
    _inline_template_target,
    _pattern_slug,
    _template_mode_value,
    attach_plain_english_prompt_detail,
    apply_specimen_tuning_to_target,
    specimen_style_prompt,
)
from app.core.llm import (
    call_llm_json as _call_llm_json,
    llm_provider_available as _llm_provider_available,
    llm_provider_label as _llm_provider_label,
    resolve_available_llm_provider as _resolve_available_llm_provider,
)
from app.domain.coach_context import pattern_display_name as _domain_pattern_display_name
from app.domain.coach_profiles import ADAPTIVE_VARIATION_STRATEGIES, SUBMISSION_DIMENSION_LABELS
from app.domain.feedback_builder import adaptive_primary_failure as _domain_adaptive_primary_failure
from app.domain.llm_resilience import SubmissionFeedbackUnavailableError
from app.models import AdaptiveVariationRequest, AdaptiveVariationResponse, SequentialVariationRequest, SequentialVariationResponse, TemplateMode


def _build_variation_drill(
    *,
    mode: str,
    pattern_name: str,
    pattern_slug: str,
    template_mode: str,
    specimen: str,
    prompt: str,
    title: str,
    hint: str,
    tags: list[str],
    stamp: str,
    adaptive_failure_key: str | None = None,
    adaptive_failure_label: str | None = None,
) -> dict[str, Any]:
    if mode == "adaptive":
        if not adaptive_failure_key or not adaptive_failure_label:
            raise ValueError("Adaptive variation requires failure key and label")
        drill_id = f"adaptive-{_pattern_slug(pattern_name)}-{_pattern_slug(adaptive_failure_key)}-{stamp}"
        method = adaptive_failure_label
        missing = "# repair complete"
        difficulty = "Med."
    else:
        drill_id = f"sequential-{_pattern_slug(pattern_name)}-{stamp}"
        method = "next step"
        missing = "# next step complete"
        difficulty = "Easy"

    core_shape = _core_shape_template_target(pattern_slug, specimen)
    inline_target = _inline_template_target(pattern_slug, specimen)

    return attach_plain_english_prompt_detail(
        {
            "id": drill_id,
            "title": title,
            "difficulty": difficulty,
            "prompt": prompt,
            "templatePrompts": {
                template_mode: prompt,
                TemplateMode.algorithm.value: prompt,
                "coreShape": f"{pattern_name}: recall the reusable core shape.",
                "inline": f"{pattern_name}: follow progressive conceptual line tasks.",
            },
            "templateTargets": {
                template_mode: specimen,
                TemplateMode.algorithm.value: specimen,
                "coreShape": core_shape,
                "inline": inline_target,
            },
            "solution": f"{specimen}\n{{{{missing}}}}",
            "missing": missing,
            "hint": hint,
            "tags": tags,
        },
        pattern=pattern_name,
        method=method,
    )


async def coach_adaptive_variation(body: AdaptiveVariationRequest) -> AdaptiveVariationResponse:
    provider = _resolve_available_llm_provider(body.llmProvider)
    if not _llm_provider_available(provider):
        raise SubmissionFeedbackUnavailableError(
            code="coach_llm_missing_api_key",
            message="Update backend .env with at least one coach LLM API key.",
            provider=provider,
            api_error_code="provider_auth_error",
        )

    template_mode = _template_mode_value(body.templateMode)
    primary_failure = _domain_adaptive_primary_failure(
        body.submissionRubric if isinstance(body.submissionRubric, dict) else {}
    )
    failure_key = str(primary_failure.get("key", "pattern"))
    failure_label = str(primary_failure.get("label", SUBMISSION_DIMENSION_LABELS.get(failure_key, "Core pattern")))
    pattern_name = _domain_pattern_display_name(body.skillTags) or "algorithm"
    system_prompt = (
        "Generate one adaptive recall variation for a coding interview trainer. "
        "Return strict JSON with keys prompt, specimen, hint, title, variationReason. "
        "The specimen is the exact next target the user should recall. "
        "Keep the same algorithm family, but vary the specimen to pressure the targetDimension. "
        "For algorithm mode, specimen must be Python. "
        f"{specimen_style_prompt(body.specimenTuning)} "
        "Prompt must stay concise, usually 8 to 12 words, and should briefly say why the pattern helps before the move. "
        "Do not include markdown. Do not include '{{missing}}'."
    )
    llm_payload = {
        "pattern": pattern_name,
        "templateMode": template_mode,
        "targetDimension": {"key": failure_key, "label": failure_label},
        "strategy": ADAPTIVE_VARIATION_STRATEGIES.get(failure_key, ADAPTIVE_VARIATION_STRATEGIES["pattern"]),
        "previousPrompt": body.prompt,
        "previousTarget": body.expectedAnswer,
        "userAnswer": body.userAnswer,
        "submissionRubric": body.submissionRubric,
        "specimenTuning": body.specimenTuning,
    }
    llm_response = await asyncio.to_thread(_call_llm_json, system_prompt, llm_payload, provider)
    if not isinstance(llm_response, dict):
        raise SubmissionFeedbackUnavailableError(
            code="coach_llm_no_response",
            message=f"Adaptive variation cannot be generated at this time. No response from {_llm_provider_label(provider)}.",
            provider=provider,
            api_error_code="provider_empty_response",
        )

    specimen = apply_specimen_tuning_to_target(
        str(llm_response.get("specimen", "")).replace("\r\n", "\n").replace("{{missing}}", "").strip(),
        body.specimenTuning,
    )
    if not specimen:
        raise SubmissionFeedbackUnavailableError(
            code="coach_llm_invalid_response",
            message=f"Adaptive variation cannot be generated at this time. Invalid response from {_llm_provider_label(provider)}.",
            provider=provider,
            api_error_code="provider_invalid_json",
        )

    prompt = _clean_concise_prompt(str(llm_response.get("prompt", "")).strip())
    title = str(llm_response.get("title", "")).strip()
    hint = str(llm_response.get("hint", "")).strip()
    reason = str(llm_response.get("variationReason", "")).strip()
    if not all([prompt, title, hint, reason]):
        raise SubmissionFeedbackUnavailableError(
            code="coach_llm_invalid_response",
            message=f"Adaptive variation cannot be generated at this time. Invalid response from {_llm_provider_label(provider)}.",
            provider=provider,
            api_error_code="provider_invalid_json",
        )

    target_dimension_tag = f"adaptive-{_pattern_slug(failure_key)}"
    stamp = datetime.now(tz=timezone.utc).strftime("%Y%m%d%H%M%S%f")
    tags = [str(tag) for tag in body.skillTags if str(tag).strip()]
    for tag in ("skill-map", "adaptive-variation", target_dimension_tag):
        if tag not in tags:
            tags.append(tag)

    drill = _build_variation_drill(
        mode="adaptive",
        pattern_name=pattern_name,
        pattern_slug=_pattern_slug(pattern_name),
        template_mode=template_mode,
        specimen=specimen,
        prompt=prompt,
        title=title,
        hint=hint,
        tags=tags,
        stamp=stamp,
        adaptive_failure_key=failure_key,
        adaptive_failure_label=failure_label,
    )
    return AdaptiveVariationResponse(
        drill=drill,
        targetDimension=failure_key,
        variationReason=reason,
        llmUsed=True,
    )


async def coach_sequential_variation(body: SequentialVariationRequest) -> SequentialVariationResponse:
    provider = _resolve_available_llm_provider(body.llmProvider)
    if not _llm_provider_available(provider):
        raise SubmissionFeedbackUnavailableError(
            code="coach_llm_missing_api_key",
            message="Update backend .env with at least one coach LLM API key.",
            provider=provider,
            api_error_code="provider_auth_error",
        )

    template_mode = _template_mode_value(body.templateMode)
    pattern_name = _domain_pattern_display_name(body.skillTags) or "algorithm"
    system_prompt = (
        "Generate one sequential recall variation for a coding interview trainer. "
        "Return strict JSON with keys prompt, specimen, hint, title, progressionReason. "
        "The specimen is the exact next target the user should recall. "
        "Keep the same algorithm family and preserve most of the current code. "
        "Make the smallest logical code change that produces a different useful behavior, boundary, or capability. "
        "The next step should feel like an easy sequential follow-up to the current specimen, not a repair and not a rewrite. "
        "For algorithm mode, specimen must be Python. "
        f"{specimen_style_prompt(body.specimenTuning)} "
        "Prompt must stay concise, usually 8 to 12 words, and should briefly name the new step. "
        "Do not include markdown. Do not include '{{missing}}'."
    )
    llm_payload = {
        "pattern": pattern_name,
        "templateMode": template_mode,
        "progressionGoal": "make the smallest next code change that creates a different useful behavior",
        "cardTitle": body.cardTitle,
        "previousPrompt": body.prompt,
        "currentTarget": body.expectedAnswer,
        "skillTags": body.skillTags,
        "specimenTuning": body.specimenTuning,
    }
    llm_response = await asyncio.to_thread(_call_llm_json, system_prompt, llm_payload, provider)
    if not isinstance(llm_response, dict):
        raise SubmissionFeedbackUnavailableError(
            code="coach_llm_no_response",
            message=f"Sequential variation cannot be generated at this time. No response from {_llm_provider_label(provider)}.",
            provider=provider,
            api_error_code="provider_empty_response",
        )

    specimen = apply_specimen_tuning_to_target(
        str(llm_response.get("specimen", "")).replace("\r\n", "\n").replace("{{missing}}", "").strip(),
        body.specimenTuning,
    )
    if not specimen:
        raise SubmissionFeedbackUnavailableError(
            code="coach_llm_invalid_response",
            message=f"Sequential variation cannot be generated at this time. Invalid response from {_llm_provider_label(provider)}.",
            provider=provider,
            api_error_code="provider_invalid_json",
        )

    prompt = _clean_concise_prompt(str(llm_response.get("prompt", "")).strip())
    title = str(llm_response.get("title", "")).strip()
    hint = str(llm_response.get("hint", "")).strip()
    progression_reason = str(llm_response.get("progressionReason", "")).strip()
    if not all([prompt, title, hint, progression_reason]):
        raise SubmissionFeedbackUnavailableError(
            code="coach_llm_invalid_response",
            message=f"Sequential variation cannot be generated at this time. Invalid response from {_llm_provider_label(provider)}.",
            provider=provider,
            api_error_code="provider_invalid_json",
        )

    stamp = datetime.now(tz=timezone.utc).strftime("%Y%m%d%H%M%S%f")
    tags = [str(tag) for tag in body.skillTags if str(tag).strip()]
    for tag in ("skill-map", "sequential-flow", "sequential-next-step"):
        if tag not in tags:
            tags.append(tag)

    drill = _build_variation_drill(
        mode="sequential",
        pattern_name=pattern_name,
        pattern_slug=_pattern_slug(pattern_name),
        template_mode=template_mode,
        specimen=specimen,
        prompt=prompt,
        title=title,
        hint=hint,
        tags=tags,
        stamp=stamp,
    )
    return SequentialVariationResponse(
        drill=drill,
        progressionReason=progression_reason,
        llmUsed=True,
    )
