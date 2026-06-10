from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable

from app.config import settings
from app.core.generator import (
    GeneratorRuntime,
    GeneratorTuning,
    SkillMapDrillGenerator,
    generate_multiple_choice_drills_response,
)
from app.core.llm import (
    call_llm_json as _call_llm_json,
    llm_provider_available as _llm_provider_available,
    llm_provider_label as _llm_provider_label,
    preferred_provider_chain as _preferred_provider_chain,
    resolve_available_llm_provider as _resolve_available_llm_provider,
)
from app.domain.llm_resilience import SubmissionFeedbackUnavailableError
from app.models import MultipleChoiceDrillsRequest, MultipleChoiceDrillsResponse, SkillMapDrillsRequest
from app.core.generator import GeneratorUnavailableError
from app.services.contracts import PersistGeneratedQuestions, PersistSkillMapDrills, SkillMapProgressSummary

import logging

logger = logging.getLogger(__name__)

DRILL_GEN_MAX_TOKENS = 8000
DRILL_GEN_OPENAI_TIMEOUT_SECONDS = 90
DRILL_GEN_TEMPERATURE = 0.7


def _make_skill_map_drill_generator(
    persist_skill_map_drills: PersistSkillMapDrills,
) -> SkillMapDrillGenerator:
    runtime = GeneratorRuntime(
        call_llm_json=_call_llm_json,
        persist_skill_map_drills=persist_skill_map_drills,
        drill_gen_max_tokens=DRILL_GEN_MAX_TOKENS,
        drill_gen_openai_timeout_seconds=DRILL_GEN_OPENAI_TIMEOUT_SECONDS,
        drill_gen_temperature=DRILL_GEN_TEMPERATURE,
        logger=logger,
    )
    return SkillMapDrillGenerator(
        runtime=runtime,
        tuning=GeneratorTuning.from_settings(),
    )


async def coach_skill_map_drills(
    body: SkillMapDrillsRequest,
    progress_summary: SkillMapProgressSummary,
    persist_skill_map_drills: PersistSkillMapDrills,
):
    provider = _resolve_available_llm_provider(body.llmProvider)
    skill_map_drill_generator = _make_skill_map_drill_generator(persist_skill_map_drills)
    return await skill_map_drill_generator.generate_response(
        body=body,
        progress_summary=progress_summary,
        provider=provider,
        provider_label=_llm_provider_label(provider),
        provider_available=_llm_provider_available(provider),
    )


async def coach_skill_map_drills_stream(
    body: SkillMapDrillsRequest,
    progress_summary: SkillMapProgressSummary,
    persist_skill_map_drills: PersistSkillMapDrills,
) -> AsyncIterator[str]:
    provider = _resolve_available_llm_provider(body.llmProvider)
    skill_map_drill_generator = _make_skill_map_drill_generator(persist_skill_map_drills)
    return skill_map_drill_generator.stream_response(
        body=body,
        progress_summary=progress_summary,
        provider=provider,
        provider_label=_llm_provider_label(provider),
        provider_available=_llm_provider_available(provider),
    )


async def coach_multiple_choice_drills(
    body: MultipleChoiceDrillsRequest,
    persist_generated_questions: PersistGeneratedQuestions,
) -> MultipleChoiceDrillsResponse:
    provider = _resolve_available_llm_provider(body.llmProvider)
    provider_label = _llm_provider_label(provider)
    fallback_providers = [
        (
            candidate,
            _llm_provider_label(candidate),
            _llm_provider_available(candidate),
        )
        for candidate in _preferred_provider_chain(body.llmProvider)
    ]

    try:
        return await generate_multiple_choice_drills_response(
            body,
            provider=provider,
            provider_label=provider_label,
            provider_available=_llm_provider_available(provider),
            call_llm_json=_call_llm_json,
            fallback_providers=fallback_providers,
            provider_timeout_seconds=int(getattr(settings, "coach_generator_timeout_seconds", 90)),
            persist_generated_questions=persist_generated_questions,
            logger=logger,
        )
    except GeneratorUnavailableError as error:
        raise SubmissionFeedbackUnavailableError(
            code=error.code,
            message=error.message,
            provider=error.provider,
            api_error_code=error.api_error_code,
        ) from error
