from __future__ import annotations

import pytest

from app.routers.generator import (
    GeneratorCostTuning,
    GeneratorOutputTuning,
    GeneratorRuntime,
    GeneratorTuning,
    SkillMapDrillGenerator,
    build_generator_context,
    runtime_with_tuning,
)


@pytest.mark.asyncio
async def test_skill_map_generator_returns_llm_drills_when_provider_available(
    skill_map_request,
    progress_summary,
    llm_drills_payload,
) -> None:
    persisted: dict = {}

    def call_llm_json(*_args, **_kwargs):
        return llm_drills_payload

    async def persist(drills, llm_used, summary):
        persisted["drills"] = drills
        persisted["llm_used"] = llm_used
        persisted["summary"] = summary

    runtime = GeneratorRuntime(
        call_llm_json=call_llm_json,
        persist_skill_map_drills=persist,
        drill_gen_max_tokens=8000,
        drill_gen_openai_timeout_seconds=90,
        drill_gen_temperature=0.7,
    )
    generator = SkillMapDrillGenerator(runtime=runtime)

    result = await generator.generate_response(
        body=skill_map_request,
        progress_summary=progress_summary,
        provider="openai",
        provider_label="ChatGPT",
        provider_available=True,
    )

    assert result["llmUsed"] is True
    assert len(result["drills"]) == 2
    assert persisted["llm_used"] is True
    assert len(persisted["drills"]) == 2


@pytest.mark.asyncio
async def test_skill_map_generator_falls_back_when_provider_unavailable(skill_map_request, progress_summary) -> None:
    persisted: dict = {}

    def call_llm_json(*_args, **_kwargs):
        raise AssertionError("LLM should not be called when provider is unavailable")

    async def persist(drills, llm_used, _summary):
        persisted["llm_used"] = llm_used
        persisted["count"] = len(drills)

    runtime = GeneratorRuntime(
        call_llm_json=call_llm_json,
        persist_skill_map_drills=persist,
        drill_gen_max_tokens=8000,
        drill_gen_openai_timeout_seconds=90,
        drill_gen_temperature=0.7,
    )
    generator = SkillMapDrillGenerator(runtime=runtime)

    result = await generator.generate_response(
        body=skill_map_request,
        progress_summary=progress_summary,
        provider="openai",
        provider_label="ChatGPT",
        provider_available=False,
    )

    assert result["llmUsed"] is False
    assert len(result["drills"]) == 2
    assert persisted["llm_used"] is False
    assert persisted["count"] == 2


def test_runtime_with_tuning_applies_cost_overrides() -> None:
    runtime = GeneratorRuntime(
        call_llm_json=lambda *_args, **_kwargs: None,
        persist_skill_map_drills=lambda *_args, **_kwargs: None,
        drill_gen_max_tokens=111,
        drill_gen_openai_timeout_seconds=22,
        drill_gen_temperature=0.1,
    )
    tuning = GeneratorTuning(
        output=GeneratorOutputTuning(),
        cost=GeneratorCostTuning(max_tokens=4321, timeout_seconds=45, temperature=0.35),
    )

    tuned = runtime_with_tuning(runtime, tuning)
    assert tuned.drill_gen_max_tokens == 4321
    assert tuned.drill_gen_openai_timeout_seconds == 45
    assert tuned.drill_gen_temperature == 0.35


def test_build_generator_context_applies_readiness_threshold(skill_map_request, progress_summary) -> None:
    tuning = GeneratorTuning(
        output=GeneratorOutputTuning(readiness_threshold=93.0),
        cost=GeneratorCostTuning(pattern_history_limit=0),
    )
    context = build_generator_context(
        skill_map_request,
        progress_summary,
        provider="openai",
        provider_label="ChatGPT",
        tuning=tuning,
    )

    pattern_progress = context.llm_payload["practiceHistory"]["patterns"]
    # readiness 95 with attempts > 0 still remains; threshold change should not remove attempted patterns.
    assert "two-pointers" in pattern_progress
    assert context.output_tuning.readiness_threshold == 93.0
