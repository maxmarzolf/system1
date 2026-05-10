from __future__ import annotations

import json
import re

import pytest

from app.models import SkillMapDrillsRequest, SkillMapNode, TemplateMode
from app.core.generator import (
    GeneratorCostTuning,
    GeneratorOutputTuning,
    GeneratorRuntime,
    GeneratorTuning,
    SkillMapDrillGenerator,
    build_generator_context,
    runtime_with_tuning,
)
from app.core.focused_static_cards import (
    focused_difficulty,
    focused_hint,
    focused_prompt,
    focused_skeleton_for_method,
    focused_target_terms,
    focused_title,
)


def _test_word_count(value: str) -> int:
    return len(value.replace("/", " ").replace("-", " ").split())


async def _collect_sse_drills(response) -> list[dict]:
    text = ""
    async for chunk in response.body_iterator:
        text += chunk.decode("utf-8") if isinstance(chunk, bytes) else str(chunk)
    drills: list[dict] = []
    event_type = ""
    for line in text.splitlines():
        if line.startswith("event: "):
            event_type = line.removeprefix("event: ").strip()
        elif line.startswith("data: ") and event_type == "drill":
            drills.append(json.loads(line.removeprefix("data: "))["drill"])
    return drills


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
    assert result["drills"][0]["plainEnglishPromptDetail"]["plainEnglish"]
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


def test_build_generator_context_includes_specimen_tuning(skill_map_request, progress_summary) -> None:
    skill_map_request.specimenTuning = {
        "typeHints": "include",
        "comments": "brief",
        "variableNames": "descriptive",
    }

    context = build_generator_context(
        skill_map_request,
        progress_summary,
        provider="openai",
        provider_label="ChatGPT",
        tuning=GeneratorTuning(),
    )

    assert context.llm_payload["specimenTuning"] == skill_map_request.specimenTuning
    assert "Use simple Python type hints" in context.system_prompt
    assert "Use explicit names" in context.system_prompt


def test_focused_generator_context_preserves_dashboard_method_order(progress_summary) -> None:
    request = SkillMapDrillsRequest(
        questionType="skill-map-targeted",
        count=3,
        templateMode=TemplateMode.algorithm,
        skillMap=[
            SkillMapNode(pattern="Binary Search", methods=["left / right bounds"]),
            SkillMapNode(pattern="Binary Search", methods=["mid calculation"]),
            SkillMapNode(pattern="Binary Search", methods=["first / last occurrence"]),
        ],
    )

    context = build_generator_context(
        request,
        progress_summary,
        provider="openai",
        provider_label="ChatGPT",
        tuning=GeneratorTuning(),
    )

    assert [node.methods[0] for node in context.generation_skill_map] == [
        "left / right bounds",
        "mid calculation",
        "first / last occurrence",
    ]
    assert [node["methods"][0] for node in context.llm_payload["skillMap"]] == [
        "left / right bounds",
        "mid calculation",
        "first / last occurrence",
    ]
    assert "target-locked" in context.system_prompt


def test_focused_static_catalog_covers_dashboard_methods() -> None:
    dashboard_skill_map = [
        ("Sliding Window", ["fixed vs variable window", "expand / shrink rhythm", "frequency maps", "valid window rule", "window score updates"]),
        ("Two Pointers", ["same-direction scan", "opposing pointers", "sorted-array leverage", "dedupe rules", "pointer move rule"]),
        ("Binary Search", ["left / right bounds", "mid calculation", "search on answer", "first / last occurrence", "boundary rule handling"]),
        ("DFS / BFS", ["base-case guards", "visited tracking", "pre / post-order thinking", "queue frontier management", "level-by-level expansion"]),
        ("Backtracking", ["choice / explore / undo", "path state", "pruning conditions", "start index control", "result collection"]),
        ("Heap / Priority Queue", ["top-k maintenance", "min vs max heap choice", "push / pop discipline", "stream processing", "lazy deletion patterns"]),
        ("Union Find", ["parent initialization", "find with compression", "union by rank / size", "component counting", "cycle detection"]),
        ("Dynamic Programming", ["state definition", "transition equation", "base cases", "iteration order", "space optimization"]),
        ("Graph Traversal", ["adjacency representation", "start state selection", "topological ordering", "indegree bookkeeping", "shortest-path framing"]),
        ("Intervals", ["sort by start / end", "merge overlap logic", "sweep decisions", "room / resource counting", "boundary comparisons"]),
        ("Prefix Sums", ["running total setup", "sum-to-index map", "subarray difference trick", "mod remainder buckets", "constant-time range queries"]),
        ("Monotonic Stack", ["increasing vs decreasing stack", "next greater / smaller", "pop trigger rule", "index storage", "span / area computation"]),
    ]

    for pattern, methods in dashboard_skill_map:
        prompts: list[str] = []
        skeletons: list[str] = []
        for method in methods:
            title = focused_title(pattern, method)
            prompt = focused_prompt(pattern, method)
            hint = focused_hint(pattern, method)
            difficulty = focused_difficulty(pattern, method)
            skeleton = focused_skeleton_for_method(pattern, method)
            target_terms = focused_target_terms(pattern, method)

            assert title
            assert prompt
            assert hint
            assert difficulty in {"Easy", "Med.", "Hard"}
            assert skeleton
            assert target_terms
            assert _test_word_count(prompt) <= 8
            assert _test_word_count(hint) <= 12
            assert any(term.lower() in skeleton.lower() for term in target_terms)
            assert ";" not in skeleton
            assert not re.search(r"^\s*(if|elif|else|for|while)[^\n]*:[^\n]*\S", skeleton, re.MULTILINE)
            prompts.append(prompt)
            skeletons.append(skeleton)

        assert len(set(prompts)) == len(prompts)
        assert len(set(skeletons)) == len(skeletons)

    assert focused_difficulty("Sliding Window", "fixed vs variable window") == "Easy"
    assert focused_difficulty("Sliding Window", "frequency maps") == "Med."
    assert focused_difficulty("Heap / Priority Queue", "push / pop discipline") == "Hard"
    assert focused_difficulty("Intervals", "sweep decisions") == "Hard"
    assert focused_difficulty("Prefix Sums", "constant-time range queries") == "Easy"
    assert focused_difficulty("Monotonic Stack", "pop trigger rule") == "Hard"


@pytest.mark.asyncio
async def test_focused_generation_rewrites_drifting_llm_card(progress_summary) -> None:
    request = SkillMapDrillsRequest(
        questionType="skill-map-targeted",
        count=1,
        templateMode=TemplateMode.algorithm,
        skillMap=[SkillMapNode(pattern="Binary Search", methods=["left / right bounds"])],
    )
    persisted: dict = {}

    def call_llm_json(*_args, **_kwargs):
        return {
            "drills": [
                {
                    "id": "drift-1",
                    "title": "Garden Story Problem",
                    "difficulty": "Hard",
                    "prompt": "Write a long story solution that does not name the selected move clearly",
                    "solution": "def unrelated(items):\n    for item in items:\n        {{missing}}\n    return items",
                    "missing": "print(item)",
                    "hint": "Think through the story and decide what the problem is asking before coding anything.",
                    "tags": ["skill-map", "sliding-window"],
                }
            ]
        }

    async def persist(drills, llm_used, _summary):
        persisted["drills"] = drills
        persisted["llm_used"] = llm_used

    runtime = GeneratorRuntime(
        call_llm_json=call_llm_json,
        persist_skill_map_drills=persist,
        drill_gen_max_tokens=8000,
        drill_gen_openai_timeout_seconds=90,
        drill_gen_temperature=0.7,
    )

    result = await SkillMapDrillGenerator(runtime=runtime).generate_response(
        body=request,
        progress_summary=progress_summary,
        provider="openai",
        provider_label="ChatGPT",
        provider_available=True,
    )

    drill = result["drills"][0]
    target = drill["templateTargets"]["algorithm"]
    assert result["llmUsed"] is True
    assert drill["title"] == "Search Insert Position"
    assert _test_word_count(drill["prompt"]) <= 8
    assert _test_word_count(drill["hint"]) <= 12
    assert "binary-search" in drill["tags"]
    assert "left-right-bounds" in drill["tags"]
    assert "lower_bound" in target
    assert "unrelated" not in target
    assert drill["plainEnglishPromptDetail"]["plainEnglish"]
    assert persisted["llm_used"] is True


@pytest.mark.asyncio
async def test_focused_two_pointer_card_uses_problem_title_and_concrete_plain_english(progress_summary) -> None:
    request = SkillMapDrillsRequest(
        questionType="skill-map-targeted",
        count=1,
        templateMode=TemplateMode.algorithm,
        skillMap=[SkillMapNode(pattern="Two Pointers", methods=["same-direction scan"])],
    )

    def call_llm_json(*_args, **_kwargs):
        return {
            "drills": [
                {
                    "id": "two-pointer-1",
                    "title": "Two Pointers - Same direction scan",
                    "difficulty": "Med.",
                    "prompt": "Two Pointers: same direction scan",
                    "solution": "def compact_scan(nums):\n    write = 0\n    for read, val in enumerate(nums):\n        {{missing}}\n    return write",
                    "missing": "nums[write] = val",
                    "hint": "same direction scan skeleton",
                    "tags": ["skill-map", "two-pointers"],
                }
            ]
        }

    async def persist(*_args, **_kwargs):
        return None

    runtime = GeneratorRuntime(
        call_llm_json=call_llm_json,
        persist_skill_map_drills=persist,
        drill_gen_max_tokens=8000,
        drill_gen_openai_timeout_seconds=90,
        drill_gen_temperature=0.7,
    )

    result = await SkillMapDrillGenerator(runtime=runtime).generate_response(
        body=request,
        progress_summary=progress_summary,
        provider="openai",
        provider_label="ChatGPT",
        provider_available=True,
    )

    drill = result["drills"][0]
    detail = drill["plainEnglishPromptDetail"]
    assert drill["title"] == "Remove Duplicates from Sorted Array"
    assert drill["prompt"] == "In-Place Deduplication with Read/Write Pointers"
    assert detail["interviewQuestion"].startswith("Given sorted nums")
    assert "nums = [1, 1, 2, 2, 3]" in detail["inputExample"]
    assert "nums[:3] == [1, 2, 3]" in detail["outputExample"]
    assert "Read every item" in detail["brassTacks"]


@pytest.mark.asyncio
async def test_focused_binary_search_methods_get_distinct_cards_when_llm_is_missing_one(progress_summary) -> None:
    methods = [
        "left / right bounds",
        "mid calculation",
        "search on answer",
        "first / last occurrence",
        "boundary rule handling",
    ]
    request = SkillMapDrillsRequest(
        questionType="skill-map-targeted",
        count=len(methods),
        templateMode=TemplateMode.algorithm,
        skillMap=[SkillMapNode(pattern="Binary Search", methods=[method]) for method in methods],
    )

    def raw_lower_bound(index: int) -> dict:
        return {
            "id": f"binary-{index}",
            "title": "Search Insert Position",
            "difficulty": "Med.",
            "prompt": "Lower Bound with Left/Right Boundaries",
            "solution": "def lower_bound(nums, target):\n    left, right = 0, len(nums)\n    while left < right:\n        {{missing}}\n    return left",
            "missing": "mid = (left + right) // 2",
            "hint": "Probe mid; keep the half that may contain answer.",
            "tags": ["skill-map", "binary-search"],
        }

    def call_llm_json(*_args, **_kwargs):
        return {"drills": [raw_lower_bound(index) for index in range(4)]}

    persisted: dict = {}

    async def persist(drills, llm_used, _summary):
        persisted["drills"] = drills
        persisted["llm_used"] = llm_used

    runtime = GeneratorRuntime(
        call_llm_json=call_llm_json,
        persist_skill_map_drills=persist,
        drill_gen_max_tokens=8000,
        drill_gen_openai_timeout_seconds=90,
        drill_gen_temperature=0.7,
    )

    response = SkillMapDrillGenerator(runtime=runtime).stream_response(
        body=request,
        progress_summary=progress_summary,
        provider="claude",
        provider_label="Claude",
        provider_available=True,
    )
    drills = await _collect_sse_drills(response)

    assert len(drills) == 5
    assert [drill["title"] for drill in drills] == [
        "Search Insert Position",
        "Guess Number Higher or Lower",
        "Koko Eating Bananas",
        "Find First and Last Position",
        "First Bad Version",
    ]
    assert [drill["prompt"] for drill in drills] == [
        "Lower Bound with Left/Right Boundaries",
        "Overflow-Safe Midpoint Probe",
        "Binary Search on Feasible Answer",
        "Duplicate Range Boundary Search",
        "Invariant-Preserving Boundary Update",
    ]
    assert "lower_bound" in drills[0]["templateTargets"]["algorithm"]
    assert "binary_search" in drills[1]["templateTargets"]["algorithm"]
    assert "min_speed" in drills[2]["templateTargets"]["algorithm"]
    assert "search_range" in drills[3]["templateTargets"]["algorithm"]
    assert "first_bad" in drills[4]["templateTargets"]["algorithm"]
    assert all(method.replace(" / ", "-").replace(" ", "-").lower() in drill["tags"] for method, drill in zip(methods, drills))
    assert persisted["llm_used"] is True
    assert len(persisted["drills"]) == 5
