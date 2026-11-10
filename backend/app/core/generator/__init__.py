"""Drill generation, split by concern. Import from the submodule you need; the
names below are the package's public surface for services."""

from app.core.generator.types import GeneratorContext, GeneratorCostTuning, GeneratorOutputTuning, GeneratorRuntime, GeneratorTuning, MultipleChoiceQuestionPayload, SkillMapDrillsEnvelope, TEMPLATE_MODE_ORDER
from app.core.generator.text import template_mode_value
from app.core.generator.code_style import apply_specimen_tuning_to_target, specimen_style_prompt
from app.core.generator.mcq import generate_multiple_choice_drills_response
from app.core.generator.prompts import attach_plain_english_prompt_detail, build_plain_english_prompt_detail
from app.core.generator.skill_map import SkillMapDrillGenerator, build_generator_context, fallback_skill_map_drills, generate_skill_map_drills, runtime_with_tuning, skill_map_drills_fallback_stream_response, skill_map_drills_stream_response, stamp_skill_map_drills

__all__ = [
    "GeneratorContext",
    "GeneratorCostTuning",
    "GeneratorOutputTuning",
    "GeneratorRuntime",
    "GeneratorTuning",
    "MultipleChoiceQuestionPayload",
    "SkillMapDrillGenerator",
    "SkillMapDrillsEnvelope",
    "TEMPLATE_MODE_ORDER",
    "apply_specimen_tuning_to_target",
    "attach_plain_english_prompt_detail",
    "build_generator_context",
    "build_plain_english_prompt_detail",
    "fallback_skill_map_drills",
    "generate_multiple_choice_drills_response",
    "generate_skill_map_drills",
    "runtime_with_tuning",
    "skill_map_drills_fallback_stream_response",
    "skill_map_drills_stream_response",
    "specimen_style_prompt",
    "stamp_skill_map_drills",
    "template_mode_value",
]
