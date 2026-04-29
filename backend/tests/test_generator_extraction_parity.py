from __future__ import annotations

from app.routers import coach, generator


def test_coach_uses_generator_pattern_slug() -> None:
    assert coach._pattern_slug is generator._pattern_slug


def test_coach_uses_generator_template_mode_value() -> None:
    assert coach._template_mode_value is generator._template_mode_value


def test_coach_uses_generator_clean_concise_prompt() -> None:
    assert coach._clean_concise_prompt is generator._clean_concise_prompt


def test_coach_wires_skill_map_generator_service() -> None:
    assert isinstance(coach.SKILL_MAP_DRILL_GENERATOR, generator.SkillMapDrillGenerator)
