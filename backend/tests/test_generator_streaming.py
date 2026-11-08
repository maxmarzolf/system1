"""Skill-map drill streaming: the incremental JSON parser, OpenAI SSE, fallbacks and helpers."""

from __future__ import annotations

import json
import logging

import pytest

from app.core import generator
from app.core.generator import GeneratorRuntime, SkillMapDrillGenerator


def runtime(call_llm_json, persisted: dict) -> GeneratorRuntime:
    async def persist(drills, llm_used, summary):
        persisted.update(drills=drills, llm_used=llm_used)

    return GeneratorRuntime(
        call_llm_json=call_llm_json,
        persist_skill_map_drills=persist,
        drill_gen_max_tokens=100,
        drill_gen_openai_timeout_seconds=5,
        drill_gen_temperature=0.1,
        logger=logging.getLogger("test"),
    )


async def collect(stream) -> list[tuple[str, dict]]:
    text = "".join([chunk async for chunk in stream])
    events: list[tuple[str, dict]] = []
    for block in text.strip().split("\n\n"):
        event, data = block.split("\n", 1)
        events.append((event.removeprefix("event: "), json.loads(data.removeprefix("data: "))))
    return events


def stream(skill_map_request, progress_summary, call_llm_json, persisted, available=True):
    return SkillMapDrillGenerator(runtime(call_llm_json, persisted)).stream_response(
        skill_map_request, progress_summary, "openai", "ChatGPT", available
    )


# ── parser ──


def test_stream_parser_emits_each_complete_drill_once() -> None:
    parser = generator._DrillStreamParser()
    payload = json.dumps({"drills": [{"id": "a", "s": "x { y } \"q\""}, {"id": "b"}], "note": "{not a drill}"})
    found: list[dict] = []
    for index in range(0, len(payload), 7):
        found += parser.feed(payload[index : index + 7])
    assert [drill["id"] for drill in found] == ["a", "b"]
    assert parser.drills == found


def test_stream_parser_skips_broken_items() -> None:
    parser = generator._DrillStreamParser()
    assert parser.feed('{"drills": [{"id": 1, "x": tru}, {"id": 2}]}') == [{"id": 2}]


# ── OpenAI SSE ──


class FakeStream:
    def __init__(self, lines: list[str]):
        self._lines = [line.encode("utf-8") for line in lines]

    def __iter__(self):
        return iter(self._lines)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def sse(*deltas: str) -> list[str]:
    lines = [": keep-alive", ""]
    lines += [f"data: {json.dumps({'choices': [{'delta': {'content': delta}}]})}" for delta in deltas]
    lines += ["data: not json", "data: [DONE]", "data: ignored"]
    return lines


# ── stream responses ──


async def test_stream_uses_openai_streaming(monkeypatch, skill_map_request, progress_summary, llm_drills_payload) -> None:
    monkeypatch.setattr(generator.settings, "coach_openai_api_key", "sk")
    text = json.dumps(llm_drills_payload)
    monkeypatch.setattr(generator, "stream_openai_text", lambda *a: iter([text[:40], text[40:]]))
    persisted: dict = {}
    events = await collect(stream(skill_map_request, progress_summary, lambda *a: None, persisted))
    assert [event for event, _ in events] == ["drill", "drill", "done"]
    assert events[-1][1] == {"count": 2, "llmUsed": True}
    assert events[0][1]["total"] == 2
    assert persisted["llm_used"] is True and len(persisted["drills"]) == 2


async def test_stream_falls_back_to_json_call_when_streaming_breaks(
    monkeypatch, skill_map_request, progress_summary, llm_drills_payload
) -> None:
    monkeypatch.setattr(generator.settings, "coach_openai_api_key", "sk")

    def broken(*_args):
        raise OSError("connection reset")
        yield ""  # pragma: no cover

    monkeypatch.setattr(generator, "stream_openai_text", broken)
    events = await collect(stream(skill_map_request, progress_summary, lambda *a: llm_drills_payload, {}))
    assert events[-1] == ("done", {"count": 2, "llmUsed": True})


async def test_stream_fills_missing_drills_from_fallback(monkeypatch, skill_map_request, progress_summary) -> None:
    monkeypatch.setattr(generator.settings, "coach_openai_api_key", "")
    persisted: dict = {}
    events = await collect(stream(skill_map_request, progress_summary, lambda *a: {"drills": [{"bad": 1}]}, persisted))
    assert events[-1] == ("done", {"count": 2, "llmUsed": False})
    assert persisted["llm_used"] is False


async def test_stream_reports_generation_errors(monkeypatch, skill_map_request, progress_summary) -> None:
    monkeypatch.setattr(generator.settings, "coach_openai_api_key", "")

    def explode(*_args):
        raise RuntimeError("boom")

    events = await collect(stream(skill_map_request, progress_summary, explode, {}))
    assert events == [("error", {"message": "boom"})]


async def test_fallback_stream_when_provider_unavailable(skill_map_request, progress_summary) -> None:
    persisted: dict = {}
    events = await collect(stream(skill_map_request, progress_summary, lambda *a: None, persisted, available=False))
    assert [event for event, _ in events] == ["drill", "drill", "done"]
    assert all("skill-map" in data["drill"]["tags"] for event, data in events if event == "drill")
    assert persisted["llm_used"] is False


async def test_generate_response_falls_back_when_llm_output_is_invalid(skill_map_request, progress_summary) -> None:
    persisted: dict = {}
    result = await SkillMapDrillGenerator(runtime(lambda *a: {"drills": []}, persisted)).generate_response(
        skill_map_request, progress_summary, "openai", "ChatGPT", True
    )
    assert result["llmUsed"] is False and len(result["drills"]) == 2


# ── helpers ──


def test_function_signature_and_sample_inputs() -> None:
    assert generator._extract_function_signature("not code") == ("solve", "", "solve()")
    target = "def window(nums: list[int], k: int, s, graph, intervals, target=0, n=1, *rest):\n    pass"
    name, params, signature = generator._extract_function_signature(target)
    assert name == "window" and signature.startswith("window(nums")
    example = generator._input_example_from_signature(target)
    assert "nums = [1, 2, 3]" in example
    assert "k = 2" in example and 's = "abc"' in example and "graph = {" in example
    assert "intervals = [[1, 3], [2, 6]]" in example and "target = 5" in example and "n = 3" in example
    assert "rest = ..." in example
    assert generator._input_example_from_signature("def f():\n    pass") == "f()"
    assert generator._sample_value_for_param("") == "value"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("Easy", "Easy"), ("medium", "Med."), ("HARD", "Hard"), ("other", "Med.")],
)
def test_difficulty_normalization(raw, expected) -> None:
    assert generator._normalize_drill_difficulty(raw) == expected
