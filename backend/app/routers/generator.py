from __future__ import annotations

import asyncio
import json
import logging
import queue as thread_queue
import random
import re
import urllib.request
from collections.abc import Awaitable, Callable, Generator
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from fastapi.responses import StreamingResponse

from app.config import settings
from app.models import SkillMapDrillsRequest, TemplateMode

TEMPLATE_MODE_ORDER = (TemplateMode.pseudo.value, TemplateMode.invariant.value, TemplateMode.algorithm.value)


class GeneratorUnavailableError(RuntimeError):
    def __init__(self, code: str, message: str, provider: str, api_error_code: str = ""):
        super().__init__(message)
        self.code = code
        self.message = message
        self.provider = provider
        self.api_error_code = api_error_code


@dataclass(frozen=True)
class GeneratorContext:
    body: SkillMapDrillsRequest
    provider: str
    provider_label: str
    progress_summary: dict[str, Any]
    generation_skill_map: list[Any]
    llm_payload: dict[str, Any]
    system_prompt: str
    stamp_prefix: str


@dataclass(frozen=True)
class GeneratorRuntime:
    call_llm_json: Callable[[str, dict[str, Any], str, int, int, float], dict[str, Any] | None]
    persist_skill_map_drills: Callable[[list[dict[str, Any]], bool, dict[str, Any]], Awaitable[None]]
    drill_gen_max_tokens: int
    drill_gen_openai_timeout_seconds: int
    drill_gen_temperature: float
    logger: logging.Logger | None = None


def _pattern_slug(pattern: str) -> str:
    return re.sub(
        r"\s+",
        "-",
        pattern.lower().replace("/", " ").replace("&", " ").replace("-", " ").strip(),
    )


def _template_mode_value(value: TemplateMode | str | None) -> str:
    if isinstance(value, TemplateMode):
        return value.value
    normalized = str(value or "").strip().lower()
    return normalized if normalized in TEMPLATE_MODE_ORDER else TemplateMode.algorithm.value


def _clean_concise_prompt(value: str, max_chars: int = 80) -> str:
    prompt = re.sub(r"\s+", " ", str(value or "").strip())
    if len(prompt) <= max_chars:
        return prompt
    shortened = prompt[:max_chars].rsplit(" ", 1)[0].strip()
    return f"{shortened}..."


def _entry_point_from_template_target(template_mode: str, target: str) -> str:
    lines = str(target or "").replace("\r\n", "\n").split("\n")
    first_line = next((line.strip() for line in lines if line.strip()), "")
    if template_mode == TemplateMode.pseudo.value:
        match = re.match(r"define\s+(.+)$", first_line, flags=re.IGNORECASE)
        return re.sub(r":\s*$", "", match.group(1)).strip() if match else ""

    match = re.match(r"def\s+([A-Za-z_]\w*)\s*\(([^)]*)\):", first_line)
    return f"{match.group(1)}({match.group(2)})" if match else ""


def _template_prompt_from_target(pattern: str, template_mode: str, target: str) -> str:
    mode_label = {
        TemplateMode.pseudo.value: "Pseudo",
        TemplateMode.invariant.value: "Invariant",
        TemplateMode.algorithm.value: "Algorithm",
    }.get(template_mode, "Recall")
    entry_point = _entry_point_from_template_target(template_mode, target)
    if entry_point:
        return f"{mode_label}: recall {entry_point}."
    return f"{mode_label}: recall {pattern.lower()}."


def _template_targets_for_drill(
    body: SkillMapDrillsRequest,
    pattern_slug: str,
    solution: str,
    missing: str,
    raw_template_targets: Any = None,
) -> dict[str, str]:
    request_targets = body.templateTargets.get(pattern_slug, {})
    targets = {
        mode: str(target)
        for mode, target in request_targets.items()
        if mode in TEMPLATE_MODE_ORDER and str(target).strip()
    }
    if isinstance(raw_template_targets, dict):
        for mode, target in raw_template_targets.items():
            if mode in TEMPLATE_MODE_ORDER and str(target).strip():
                targets[mode] = str(target).replace("\r\n", "\n").strip()
    algorithm_target = str(solution or "").replace("{{missing}}", str(missing or "")).strip()
    if algorithm_target:
        targets[TemplateMode.algorithm.value] = algorithm_target
    return targets


def _template_prompt_map(
    body: SkillMapDrillsRequest,
    pattern: str,
    pattern_slug: str,
    solution: str,
    missing: str,
    raw_template_prompts: Any = None,
    template_targets: dict[str, str] | None = None,
) -> dict[str, str]:
    targets = template_targets or _template_targets_for_drill(body, pattern_slug, solution, missing)
    raw_prompts = raw_template_prompts if isinstance(raw_template_prompts, dict) else {}
    prompts: dict[str, str] = {}

    for mode in TEMPLATE_MODE_ORDER:
        raw_prompt = _clean_concise_prompt(str(raw_prompts.get(mode, "")).strip())
        if raw_prompt:
            prompts[mode] = raw_prompt
            continue
        target = targets.get(mode, "")
        if target:
            prompts[mode] = _template_prompt_from_target(pattern, mode, target)

    return prompts


def _normalize_drill_difficulty(value: Any) -> str:
    difficulty = str(value or "").strip().lower().rstrip(".")
    if difficulty in {"easy", "e", "beginner", "simple"}:
        return "Easy"
    if difficulty in {"hard", "h", "advanced", "difficult"}:
        return "Hard"
    return "Med."


class _DrillStreamParser:
    __slots__ = ("_buf", "_in_str", "_esc", "_top", "_arr", "_obj", "_obj_start", "drills")

    def __init__(self) -> None:
        self._buf: list[str] = []
        self._in_str = False
        self._esc = False
        self._top = 0
        self._arr = False
        self._obj = 0
        self._obj_start = -1
        self.drills: list[dict[str, Any]] = []

    def feed(self, chunk: str) -> list[dict[str, Any]]:
        new: list[dict[str, Any]] = []
        for ch in chunk:
            self._buf.append(ch)
            pos = len(self._buf) - 1
            if self._esc:
                self._esc = False
                continue
            if self._in_str:
                if ch == "\\":
                    self._esc = True
                elif ch == '"':
                    self._in_str = False
                continue
            if ch == '"':
                self._in_str = True
                continue
            if self._arr:
                if ch == "{":
                    if self._obj == 0:
                        self._obj_start = pos
                    self._obj += 1
                elif ch == "}":
                    self._obj -= 1
                    if self._obj == 0 and self._obj_start >= 0:
                        item_str = "".join(self._buf[self._obj_start : pos + 1])
                        self._obj_start = -1
                        try:
                            obj = json.loads(item_str)
                            if isinstance(obj, dict):
                                new.append(obj)
                                self.drills.append(obj)
                        except (json.JSONDecodeError, ValueError):
                            pass
                elif ch == "]" and self._obj == 0:
                    self._arr = False
            else:
                if ch == "{":
                    self._top += 1
                elif ch == "}":
                    self._top = max(0, self._top - 1)
                elif ch == "[" and self._top == 1:
                    self._arr = True
        return new


def _call_openai_streaming(
    system_prompt: str,
    user_payload: dict[str, Any],
    max_tokens: int = 1800,
    timeout_seconds: int = 90,
    temperature: float = 0.7,
) -> Generator[str, None, None]:
    if not settings.coach_openai_api_key:
        return
    url = f"{settings.coach_openai_base_url.rstrip('/')}/chat/completions"
    body: dict[str, Any] = {
        "model": settings.coach_openai_model,
        "temperature": temperature,
        "max_completion_tokens": max_tokens,
        "response_format": {"type": "json_object"},
        "stream": True,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(user_payload)},
        ],
    }
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {settings.coach_openai_api_key}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
        for raw_line in resp:
            line = raw_line.decode("utf-8").strip()
            if not line or not line.startswith("data:"):
                continue
            payload = line[5:].strip()
            if payload == "[DONE]":
                break
            try:
                chunk = json.loads(payload)
                delta = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                if delta:
                    yield delta
            except (json.JSONDecodeError, KeyError, IndexError):
                continue


def _process_raw_drill(
    raw: Any,
    index: int,
    body: SkillMapDrillsRequest,
    generation_skill_map: list[Any],
) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    solution = str(raw.get("solution", "")).strip()
    missing = str(raw.get("missing", "")).strip()
    if "{{missing}}" not in solution or not missing:
        return None
    tags_raw = raw.get("tags", [])
    tags = [str(tag).strip() for tag in tags_raw if str(tag).strip()] if isinstance(tags_raw, list) else []
    if "skill-map" not in tags:
        tags = ["skill-map", *tags]
    source_node = generation_skill_map[index] if index < len(generation_skill_map) else None
    pattern = source_node.pattern if source_node else str(raw.get("title", "algorithm"))
    pattern_slug = _pattern_slug(pattern)
    if pattern_slug and pattern_slug not in tags:
        tags.append(pattern_slug)
    template_targets = _template_targets_for_drill(body, pattern_slug, solution, missing, raw.get("templateTargets", {}))
    template_prompts = _template_prompt_map(body, pattern, pattern_slug, solution, missing, raw.get("templatePrompts", {}), template_targets)
    selected_prompt = (
        template_prompts.get(_template_mode_value(body.templateMode))
        or _clean_concise_prompt(str(raw.get("prompt", "")).strip())
        or _template_prompt_from_target(pattern, _template_mode_value(body.templateMode), solution.replace("{{missing}}", missing))
    )
    return {
        "id": str(raw.get("id", f"skill-map-{index + 1}")),
        "title": str(raw.get("title", f"Skill Map Drill {index + 1}")),
        "difficulty": _normalize_drill_difficulty(raw.get("difficulty", "Med.")),
        "prompt": selected_prompt,
        "templatePrompts": template_prompts,
        "templateTargets": template_targets,
        "solution": solution,
        "missing": missing,
        "hint": str(raw.get("hint", "")).strip(),
        "tags": tags,
    }


def build_generator_context(
    body: SkillMapDrillsRequest,
    progress_summary: dict[str, Any],
    provider: str,
    provider_label: str,
) -> GeneratorContext:
    system_prompt = (
        "You generate atomic Python recall drills for coding interview preparation. "
        "Return only a top-level JSON object shaped exactly like {\"drills\": [...]}. "
        "The drills array must contain exactly the requested count of objects with keys "
        "id, title, difficulty, prompt, templatePrompts, templateTargets, solution, missing, hint, tags. "
        "Do not return a single drill object without the drills wrapper. "
        "Generate exactly one drill for each skillMap entry, in the same order as the skillMap array. "
        "Do not generate a second drill for any pattern until every provided skillMap entry has one drill. "
        "Each drill must teach one reusable LeetCode move from the provided skill map, not a story problem. "
        "Use the generationSeed and shuffled method order to vary titles, snippets, missing lines, and selected methods across calls. "
        "Make them concise and pattern-first. Prioritize patterns with low readiness or high error rates, "
        "then fill remaining slots across remaining patterns. "
        "The solution must include exactly one '{{missing}}' placeholder, and missing must be the exact code that replaces it. "
        "The prompt must be very short: 12 words or fewer. "
        "templateTargets may include pseudo and invariant. Pseudo must be concise pseudocode. Invariant must be a Python scaffold. "
        "When you return templateTargets, make them specific to the drill's pattern and method instead of generic pattern text. "
        "templatePrompts must be an object keyed by pseudo, invariant, and full when those targets are provided. "
        "Each templatePrompts value must be 12 words or fewer and must describe the exact provided template target, not a legacy or story prompt. "
        "Keep snippets short enough to memorize, but realistic enough to reuse in senior-level interviews. "
        "Tags must include 'skill-map' and a slug for the pattern."
    )

    rng = random.SystemRandom()
    generation_seed = f"{datetime.now(tz=timezone.utc).strftime('%Y%m%d%H%M%S%f')}-{rng.randrange(1_000_000)}"
    generation_skill_map = list(body.skillMap[: body.count])
    rng.shuffle(generation_skill_map)
    trimmed_skill_map = [
        {"pattern": node.pattern, "methods": rng.sample(list(node.methods), len(node.methods)) if node.methods else []}
        for node in generation_skill_map
    ]
    pattern_progress = {
        slug: data
        for slug, data in progress_summary.get("patterns", {}).items()
        if data.get("attemptCount", 0) > 0 or data.get("readiness", 100) < 90
    }
    llm_payload = {
        "questionType": body.questionType,
        "count": body.count,
        "generationSeed": generation_seed,
        "templateMode": _template_mode_value(body.templateMode),
        "templateTargets": body.templateTargets,
        "skillMap": trimmed_skill_map,
        "practiceHistory": {
            "overall": progress_summary.get("overall", {}),
            "patterns": pattern_progress,
        },
        "schema": {
            "fields": ["id", "title", "difficulty", "prompt", "templatePrompts", "templateTargets", "solution", "missing", "hint", "tags"],
            "constraint": "solution must contain exactly one {{missing}} placeholder",
            "coverage": "drills[i] must correspond to skillMap[i]",
            "variation": "avoid reusing the same title, prompt, missing line, or exact snippet shape from a previous generation",
        },
    }

    return GeneratorContext(
        body=body,
        provider=provider,
        provider_label=provider_label,
        progress_summary=progress_summary,
        generation_skill_map=generation_skill_map,
        llm_payload=llm_payload,
        system_prompt=system_prompt,
        stamp_prefix=datetime.now(tz=timezone.utc).strftime("%Y%m%d%H%M%S%f"),
    )


def _invalid_response_error(context: GeneratorContext) -> GeneratorUnavailableError:
    return GeneratorUnavailableError(
        code="coach_llm_invalid_response",
        message=f"Skill-map drills cannot be generated at this time. Invalid response from {context.provider_label}.",
        provider=context.provider,
        api_error_code="provider_invalid_json",
    )


def _fallback_template_for_pattern(pattern: str, method_hint: str) -> dict[str, Any]:
    slug = _pattern_slug(pattern) or "pattern"
    func = slug.replace("-", "_")
    method_text = method_hint.strip() if method_hint else "core method"
    solution = (
        f"def {func}_template(nums):\n"
        "    result = []\n"
        "    for value in nums:\n"
        "        {{missing}}\n"
        "    return result"
    )
    return {
        "title": f"Skill Map - {pattern.title()}: {method_text.title()}",
        "difficulty": "Med.",
        "prompt": _clean_concise_prompt(f"Algorithm: recall {func}_template(nums)."),
        "solution": solution,
        "missing": "result.append(value)",
        "hint": f"Focus on reproducing the reusable {pattern.lower()} scaffold from memory.",
        "tags": ["skill-map", slug],
    }


def fallback_skill_map_drills(context: GeneratorContext) -> dict[str, Any]:
    drills: list[dict[str, Any]] = []
    nodes = context.body.skillMap[: context.body.count]
    if not nodes:
        nodes = [type("Node", (), {"pattern": "algorithm", "methods": []})()]

    progress_by_pattern = context.progress_summary.get("patterns", {}) if isinstance(context.progress_summary, dict) else {}
    for index, node in enumerate(nodes):
        pattern = str(getattr(node, "pattern", "algorithm") or "algorithm")
        methods = list(getattr(node, "methods", []) or [])
        method_hint = str(methods[0]).strip() if methods else "core method"
        base = _fallback_template_for_pattern(pattern, method_hint)
        slug = _pattern_slug(pattern)
        progress = progress_by_pattern.get(slug, {}) if slug else {}
        difficulty = "Easy" if float(progress.get("avgAccuracy", 100) or 100) < 80 else base["difficulty"]

        template_targets = _template_targets_for_drill(
            context.body,
            slug,
            base["solution"],
            base["missing"],
        )
        template_prompts = _template_prompt_map(
            context.body,
            pattern,
            slug,
            base["solution"],
            base["missing"],
            template_targets=template_targets,
        )
        selected_prompt = template_prompts.get(_template_mode_value(context.body.templateMode)) or base["prompt"]

        drills.append(
            {
                "id": f"skill-map-fallback-{index + 1}",
                "title": base["title"],
                "difficulty": difficulty,
                "prompt": selected_prompt,
                "templatePrompts": template_prompts,
                "templateTargets": template_targets,
                "solution": base["solution"],
                "missing": base["missing"],
                "hint": base["hint"],
                "tags": base["tags"],
            }
        )

    return {"drills": drills, "llmUsed": False}


async def generate_skill_map_drills(context: GeneratorContext, runtime: GeneratorRuntime) -> dict[str, Any]:
    llm_response = await asyncio.to_thread(
        runtime.call_llm_json,
        context.system_prompt,
        context.llm_payload,
        context.provider,
        runtime.drill_gen_max_tokens,
        runtime.drill_gen_openai_timeout_seconds,
        runtime.drill_gen_temperature,
    )
    if not llm_response or not isinstance(llm_response.get("drills"), list):
        raise GeneratorUnavailableError(
            code="coach_llm_no_response",
            message=f"Skill-map drills cannot be generated at this time. No response from {context.provider_label}.",
            provider=context.provider,
            api_error_code="provider_empty_response",
        )

    drills: list[dict[str, Any]] = []
    for index, raw in enumerate(llm_response["drills"][: context.body.count]):
        processed = _process_raw_drill(raw, index, context.body, context.generation_skill_map)
        if not processed:
            raise _invalid_response_error(context)
        drills.append(processed)

    expected = min(context.body.count, len(context.generation_skill_map))
    if len(drills) != expected:
        raise _invalid_response_error(context)

    return {"drills": drills, "llmUsed": True}


def stamp_skill_map_drills(drills: list[dict[str, Any]]) -> list[dict[str, Any]]:
    stamp = datetime.now(tz=timezone.utc).strftime("%Y%m%d%H%M%S%f")
    stamped: list[dict[str, Any]] = []
    for index, drill in enumerate(drills):
        tags = [str(tag) for tag in drill.get("tags", [])]
        if "skill-map" not in tags:
            tags = ["skill-map", *tags]
        stamped.append({
            **drill,
            "id": f"skill-map-{stamp}-{index + 1}",
            "tags": tags,
        })
    return stamped


def skill_map_drills_stream_response(context: GeneratorContext, runtime: GeneratorRuntime) -> StreamingResponse:
    total_drills = min(context.body.count, len(context.generation_skill_map))

    async def generate():
        q: thread_queue.Queue[tuple[str, Any]] = thread_queue.Queue()

        def _blocking():
            try:
                parser = _DrillStreamParser()
                drill_index = 0
                llm_used = True
                use_streaming = context.provider == "openai" and bool(settings.coach_openai_api_key)

                if use_streaming:
                    try:
                        for token in _call_openai_streaming(
                            context.system_prompt,
                            context.llm_payload,
                            runtime.drill_gen_max_tokens,
                            runtime.drill_gen_openai_timeout_seconds,
                            runtime.drill_gen_temperature,
                        ):
                            new_drills = parser.feed(token)
                            for raw_drill in new_drills:
                                processed = _process_raw_drill(raw_drill, drill_index, context.body, context.generation_skill_map)
                                if processed:
                                    tags = [str(t) for t in processed.get("tags", [])]
                                    if "skill-map" not in tags:
                                        tags = ["skill-map", *tags]
                                    stamped = {
                                        **processed,
                                        "id": f"skill-map-{context.stamp_prefix}-{drill_index + 1}",
                                        "tags": tags,
                                    }
                                    q.put(("drill", {"index": drill_index, "drill": stamped, "total": total_drills}))
                                    drill_index += 1
                    except Exception as stream_err:
                        if runtime.logger:
                            runtime.logger.warning("OpenAI streaming failed, falling back: %s", stream_err)
                        drill_index = 0
                        use_streaming = False

                if not use_streaming:
                    result = runtime.call_llm_json(
                        context.system_prompt,
                        context.llm_payload,
                        context.provider,
                        runtime.drill_gen_max_tokens,
                        runtime.drill_gen_openai_timeout_seconds,
                        runtime.drill_gen_temperature,
                    )
                    if result and isinstance(result.get("drills"), list):
                        for raw_drill in result["drills"][: context.body.count]:
                            processed = _process_raw_drill(raw_drill, drill_index, context.body, context.generation_skill_map)
                            if processed:
                                tags = [str(t) for t in processed.get("tags", [])]
                                if "skill-map" not in tags:
                                    tags = ["skill-map", *tags]
                                stamped = {
                                    **processed,
                                    "id": f"skill-map-{context.stamp_prefix}-{drill_index + 1}",
                                    "tags": tags,
                                }
                                q.put(("drill", {"index": drill_index, "drill": stamped, "total": total_drills}))
                                drill_index += 1

                if drill_index == 0:
                    llm_used = False
                    fallback = fallback_skill_map_drills(context)
                    for raw_drill in fallback["drills"][: context.body.count]:
                        tags = [str(t) for t in raw_drill.get("tags", [])]
                        if "skill-map" not in tags:
                            tags = ["skill-map", *tags]
                        stamped = {
                            **raw_drill,
                            "id": f"skill-map-{context.stamp_prefix}-{drill_index + 1}",
                            "tags": tags,
                        }
                        q.put(("drill", {"index": drill_index, "drill": stamped, "total": total_drills}))
                        drill_index += 1

                q.put(("done", {"count": drill_index, "llmUsed": llm_used}))
            except Exception as exc:
                if runtime.logger:
                    runtime.logger.exception("Drill stream generation failed")
                q.put(("error", str(exc)))

        loop = asyncio.get_event_loop()
        future = loop.run_in_executor(None, _blocking)
        all_drills: list[dict[str, Any]] = []

        while True:
            while q.empty():
                if future.done():
                    break
                await asyncio.sleep(0.05)

            if q.empty() and future.done():
                exc = future.exception()
                if exc:
                    yield f"event: error\ndata: {json.dumps({'message': str(exc)})}\n\n"
                break

            try:
                event_type, data = q.get_nowait()
            except thread_queue.Empty:
                continue

            if event_type == "drill":
                all_drills.append(data["drill"])
                yield f"event: drill\ndata: {json.dumps(data)}\n\n"
            elif event_type == "done":
                llm_used = bool(data.get("llmUsed", True))
                await runtime.persist_skill_map_drills(all_drills, llm_used, context.progress_summary)
                yield f"event: done\ndata: {json.dumps({'count': len(all_drills), 'llmUsed': llm_used})}\n\n"
                break
            elif event_type == "error":
                yield f"event: error\ndata: {json.dumps({'message': data})}\n\n"
                break

        await future

    return StreamingResponse(generate(), media_type="text/event-stream")


def skill_map_drills_fallback_stream_response(context: GeneratorContext, runtime: GeneratorRuntime) -> StreamingResponse:
    total_drills = min(context.body.count, max(1, len(context.body.skillMap[: context.body.count])))

    async def generate():
        fallback = fallback_skill_map_drills(context)
        stamped: list[dict[str, Any]] = []
        for index, raw_drill in enumerate(fallback["drills"][: context.body.count]):
            tags = [str(t) for t in raw_drill.get("tags", [])]
            if "skill-map" not in tags:
                tags = ["skill-map", *tags]
            drill = {
                **raw_drill,
                "id": f"skill-map-{context.stamp_prefix}-{index + 1}",
                "tags": tags,
            }
            stamped.append(drill)
            yield f"event: drill\ndata: {json.dumps({'index': index, 'drill': drill, 'total': total_drills})}\n\n"

        await runtime.persist_skill_map_drills(stamped, False, context.progress_summary)
        yield f"event: done\ndata: {json.dumps({'count': len(stamped), 'llmUsed': False})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
