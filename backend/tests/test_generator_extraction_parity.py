from __future__ import annotations

from app.core import generator
from app.services import drill_generation_service


def test_drill_generation_service_builds_generator_runtime() -> None:
    async def _noop_persist(_drills, _llm_used, _summary):
        return None

    built = drill_generation_service._make_skill_map_drill_generator(_noop_persist)
    assert isinstance(built, generator.SkillMapDrillGenerator)
