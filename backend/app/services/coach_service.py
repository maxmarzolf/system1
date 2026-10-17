from __future__ import annotations

from app.models import (
    AdaptiveVariationRequest,
    CoachPracticeHistoryRequest,
    CoachSessionPlanRequest,
    MultipleChoiceDrillsRequest,
    SequentialVariationRequest,
    SkillMapDrillsRequest,
)
from app.services import (
    coach_orchestration_service,
    history_service,
)


async def coach_provider_default():
    return await coach_orchestration_service.coach_provider_default()


async def coach_session_plan(body: CoachSessionPlanRequest):
    return await coach_orchestration_service.coach_session_plan(body)


async def coach_practice_history(body: CoachPracticeHistoryRequest):
    return await history_service.coach_practice_history(body)


async def coach_skill_map_drills(body: SkillMapDrillsRequest):
    return await coach_orchestration_service.coach_skill_map_drills(body)


async def coach_skill_map_drills_stream(body: SkillMapDrillsRequest):
    return await coach_orchestration_service.coach_skill_map_drills_stream(body)


async def coach_multiple_choice_drills(body: MultipleChoiceDrillsRequest):
    return await coach_orchestration_service.coach_multiple_choice_drills(body)


async def coach_adaptive_variation(body: AdaptiveVariationRequest):
    return await coach_orchestration_service.coach_adaptive_variation(body)


async def coach_sequential_variation(body: SequentialVariationRequest):
    return await coach_orchestration_service.coach_sequential_variation(body)
