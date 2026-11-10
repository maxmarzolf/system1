"""Shared payload types, constants and tuning for drill generation."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, TypeAlias, TypedDict

from app.config import settings
from app.contracts.coaching import SkillMapDrillsRequest, SkillMapNode, TemplateMode


INLINE_NOTE_COLUMN = 48


TEMPLATE_MODE_ORDER = (
    TemplateMode.algorithm.value,
)


INLINE_TEMPLATE_KEY = "inline"


CORE_SHAPE_TEMPLATE_KEY = "coreShape"


TEMPLATE_TARGET_ORDER = (TemplateMode.algorithm.value, CORE_SHAPE_TEMPLATE_KEY, INLINE_TEMPLATE_KEY)


LLMJsonPayload: TypeAlias = dict[str, Any]


LLMJsonResponse: TypeAlias = dict[str, Any]


SkillMapProgressPayload: TypeAlias = dict[str, Any]


SkillMapDrillPayload: TypeAlias = dict[str, Any]


class MultipleChoiceChoicePayload(TypedDict):
    id: str
    text: str


class MultipleChoiceQuestionPayload(TypedDict, total=False):
    id: str
    title: str
    pattern: str
    skill: str
    difficulty: str
    question: str
    choices: list[MultipleChoiceChoicePayload]
    correctChoiceId: str
    explanation: str
    tags: list[str]


class SkillMapDrillsEnvelope(TypedDict):
    drills: list[SkillMapDrillPayload]
    llmUsed: bool


@dataclass(frozen=True)
class GeneratorOutputTuning:
    concise_prompt_words: int = 12
    readiness_threshold: float = 90.0
    prompt_max_chars: int = 80


@dataclass(frozen=True)
class GeneratorCostTuning:
    max_tokens: int = 8000
    timeout_seconds: int = 90
    temperature: float = 0.7
    pattern_history_limit: int = 0


@dataclass(frozen=True)
class GeneratorTuning:
    output: GeneratorOutputTuning = field(default_factory=GeneratorOutputTuning)
    cost: GeneratorCostTuning = field(default_factory=GeneratorCostTuning)

    @classmethod
    def from_settings(cls) -> "GeneratorTuning":
        return cls(
            output=GeneratorOutputTuning(
                concise_prompt_words=int(getattr(settings, "coach_generator_prompt_words", 12)),
                readiness_threshold=float(getattr(settings, "coach_generator_readiness_threshold", 90.0)),
                prompt_max_chars=int(getattr(settings, "coach_generator_prompt_max_chars", 80)),
            ),
            cost=GeneratorCostTuning(
                max_tokens=int(getattr(settings, "coach_generator_max_tokens", 8000)),
                timeout_seconds=int(getattr(settings, "coach_generator_timeout_seconds", 90)),
                temperature=float(getattr(settings, "coach_generator_temperature", 0.7)),
                pattern_history_limit=int(getattr(settings, "coach_generator_pattern_history_limit", 0)),
            ),
        )


@dataclass(frozen=True)
class GeneratorContext:
    body: SkillMapDrillsRequest
    provider: str
    provider_label: str
    progress_summary: SkillMapProgressPayload
    generation_skill_map: list[SkillMapNode]
    llm_payload: LLMJsonPayload
    system_prompt: str
    stamp_prefix: str
    output_tuning: GeneratorOutputTuning


@dataclass(frozen=True)
class GeneratorRuntime:
    call_llm_json: Callable[[str, LLMJsonPayload, str, int, int, float], LLMJsonResponse | None]
    persist_skill_map_drills: Callable[[list[SkillMapDrillPayload], bool, SkillMapProgressPayload], Awaitable[None]]
    # Cost settings; SkillMapDrillGenerator replaces these with its GeneratorTuning.
    drill_gen_max_tokens: int = GeneratorCostTuning.max_tokens
    drill_gen_openai_timeout_seconds: int = GeneratorCostTuning.timeout_seconds
    drill_gen_temperature: float = GeneratorCostTuning.temperature
    logger: logging.Logger | None = None
