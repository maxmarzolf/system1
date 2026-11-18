from __future__ import annotations

from collections.abc import AsyncIterator

from app.config import settings
from app.core.generator import (
    GeneratorRuntime,
    GeneratorTuning,
    SkillMapDrillGenerator,
    generate_multiple_choice_drills_response,
)
from app.core.llm import (
    LlmCall,
    call_llm_json as _call_llm_json,
    call_llm_json_with as _call_llm_json_with,
    llm_provider_available as _llm_provider_available,
    llm_provider_label as _llm_provider_label,
    preferred_provider_chain as _preferred_provider_chain,
    resolve_available_llm_provider as _resolve_available_llm_provider,
)
from app.models import MultipleChoiceDrillsRequest, MultipleChoiceDrillsResponse, SkillMapDrillsRequest
from app.services import app_settings_service
from app.services.contracts import PersistGeneratedQuestions, PersistSkillMapDrills, SkillMapProgressSummary

import logging

logger = logging.getLogger(__name__)

def _make_skill_map_drill_generator(
    persist_skill_map_drills: PersistSkillMapDrills,
) -> SkillMapDrillGenerator:
    runtime = GeneratorRuntime(
        call_llm_json=_call_llm_json,
        persist_skill_map_drills=persist_skill_map_drills,
        logger=logger,
    )
    return SkillMapDrillGenerator(
        runtime=runtime,
        tuning=GeneratorTuning.from_settings(),
    )


async def _with_server_specimen(body: SkillMapDrillsRequest) -> SkillMapDrillsRequest:
    """Generated cards use the specimen style set on /admin, not what the request carries."""
    generation = await app_settings_service.generation()
    return body.model_copy(update={"specimenTuning": generation.specimen.model_dump()})


async def coach_skill_map_drills(
    body: SkillMapDrillsRequest,
    progress_summary: SkillMapProgressSummary,
    persist_skill_map_drills: PersistSkillMapDrills,
):
    body = await _with_server_specimen(body)
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
    body = await _with_server_specimen(body)
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

    return await generate_multiple_choice_drills_response(
        body,
        provider=provider,
        provider_label=provider_label,
        provider_available=_llm_provider_available(provider),
        call_llm_json=_call_llm_json_with,
        call=mcq_generation_call(await app_settings_service.generation()),
        fallback_providers=fallback_providers,
        persist_generated_questions=persist_generated_questions,
        logger=logger,
    )


def mcq_generation_call(generation: app_settings_service.GenerationSettingsModel) -> LlmCall:
    """MCQ generation's call settings: the generator timeout and the MCQ models set on /admin
    (defaulting to the ``COACH_MCQ_*_MODEL`` environment settings)."""
    return LlmCall(
        timeout_seconds=settings.coach_generator_timeout_seconds,
        temperature=0.7,
        models=generation.mcqModels.model_dump(),
    )
