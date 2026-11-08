"""Skill-map drill generation: LLM drills, fallbacks and streaming."""

from __future__ import annotations

import asyncio
import json
import queue as thread_queue
import random
from collections.abc import AsyncIterator
from dataclasses import replace
from datetime import datetime, timezone
from typing import Any

from app.config import settings
from app.core.focused_core_algorithm_cards import (
    focused_difficulty as _focused_difficulty,
    focused_hint as _focused_hint,
    focused_prompt as _focused_prompt,
    focused_skeleton_for_method as _focused_skeleton_for_method,
    focused_title as _focused_title,
    method_slug as _method_slug,
    pattern_family_slug as _pattern_family_slug,
)
from app.models import SkillMapDrillsRequest, SkillMapNode, TemplateMode
from app.core.taxonomy import slugify
from app.core.llm import LlmUnavailableError, stream_openai_text
from app.core.generator.types import (
    CORE_SHAPE_TEMPLATE_KEY,
    GeneratorContext,
    GeneratorRuntime,
    GeneratorTuning,
    INLINE_TEMPLATE_KEY,
    SkillMapDrillPayload,
    SkillMapDrillsEnvelope,
    SkillMapProgressPayload,
)
from app.core.generator.text import (
    clean_concise_prompt,
    is_focused_request,
    is_playlist_request,
    limit_words,
    question_slug,
    target_line_count,
    target_looks_story_like,
    target_matches_focused_method,
    template_mode_value,
    text_anchors_method,
    word_count,
)
from app.core.generator.code_style import (
    apply_specimen_tuning_to_target,
    normalize_specimen_tuning,
    specimen_style_prompt,
)
from app.core.generator.inline_notes import (
    apply_core_shape_tuning_to_target,
    core_shape_template_target,
    inline_template_target,
    normalize_inline_template_target,
)
from app.core.generator.prompts import (
    attach_plain_english_prompt_detail,
    normalize_drill_difficulty,
    template_prompt_from_target,
    template_prompt_map,
    template_targets_for_drill,
)


def _focused_source_method(source_node: Any) -> str:
    skills = list(getattr(source_node, "skills", []) or []) if source_node else []
    return str(skills[0]).strip() if skills else "core method"


def _should_rewrite_focused_drill(raw: SkillMapDrillPayload, pattern: str, method: str, target: str) -> bool:
    title = str(raw.get("title", ""))
    prompt = str(raw.get("prompt", ""))
    hint = str(raw.get("hint", ""))
    combined = " ".join([title, prompt, hint])
    if not text_anchors_method(combined, pattern, method):
        return True
    if word_count(prompt) > 8:
        return True
    if word_count(hint) > 12:
        return True
    if not target.strip() or target_looks_story_like(target):
        return True
    if not target_matches_focused_method(target, pattern, method):
        return True
    return target_line_count(target) > 8


def _focused_drill_from_source(
    *,
    raw: SkillMapDrillPayload | None,
    index: int,
    body: SkillMapDrillsRequest,
    source_node: Any,
    pattern: str,
    pattern_slug: str,
    method: str,
) -> SkillMapDrillPayload:
    target = _focused_skeleton_for_method(pattern, method)
    target = apply_specimen_tuning_to_target(target, body.specimenTuning)
    prompt = _focused_prompt(pattern, method)
    title = _focused_title(pattern, method)
    hint = _focused_hint(pattern, method)
    method_slug = _method_slug(method)
    tags = ["skill-map", pattern_slug]
    family_slug = _pattern_family_slug(pattern_slug)
    if family_slug and family_slug not in tags:
        tags.append(family_slug)
    if method_slug and method_slug not in tags:
        tags.append(method_slug)
    return {
        "id": str((raw or {}).get("id", f"focused-{pattern_slug}-{index + 1}")),
        "title": title,
        "difficulty": _focused_difficulty(pattern, method),
        "prompt": prompt,
        "templatePrompts": {
            TemplateMode.algorithm.value: prompt,
            CORE_SHAPE_TEMPLATE_KEY: prompt,
            INLINE_TEMPLATE_KEY: limit_words(f"{pattern}: add notes", 8),
        },
        "templateTargets": {
            TemplateMode.algorithm.value: target,
            CORE_SHAPE_TEMPLATE_KEY: apply_core_shape_tuning_to_target(
                core_shape_template_target(_pattern_family_slug(pattern_slug), target),
                body.specimenTuning,
            ),
            INLINE_TEMPLATE_KEY: normalize_inline_template_target(
                _pattern_family_slug(pattern_slug),
                inline_template_target(_pattern_family_slug(pattern_slug), target),
            ),
        },
        "solution": f"{target}\n{{{{missing}}}}",
        "missing": "# skeleton complete",
        "hint": hint,
        "tags": tags,
    }


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
        self.drills: list[SkillMapDrillPayload] = []

    def feed(self, chunk: str) -> list[SkillMapDrillPayload]:
        new: list[SkillMapDrillPayload] = []
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


def _process_raw_drill(
    raw: Any,
    index: int,
    body: SkillMapDrillsRequest,
    generation_skill_map: list[SkillMapNode],
    prompt_max_chars: int = 80,
) -> SkillMapDrillPayload | None:
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
    pattern = source_node.algorithm if source_node else str(raw.get("title", "algorithm"))
    pattern_slug = slugify(pattern)
    method = _focused_source_method(source_node)
    question_title = str(getattr(source_node, "questionTitle", "") or "").strip() if source_node else ""
    playlist_slug = str(getattr(source_node, "playlistSlug", "") or "").strip() if source_node else ""
    if pattern_slug and pattern_slug not in tags:
        tags.append(pattern_slug)
    if is_focused_request(body):
        method_slug = _method_slug(method)
        family_slug = _pattern_family_slug(pattern_slug)
        if family_slug and family_slug not in tags:
            tags.append(family_slug)
        if method_slug and method_slug not in tags:
            tags.append(method_slug)
    if playlist_slug and playlist_slug not in tags:
        tags.append(playlist_slug)
    if question_title:
        title_slug = question_slug(question_title)
        if title_slug not in tags:
            tags.append(title_slug)
    template_targets = template_targets_for_drill(body, pattern_slug, solution, missing, raw.get("templateTargets", {}))
    template_prompts = template_prompt_map(
        body,
        pattern,
        pattern_slug,
        solution,
        missing,
        raw.get("templatePrompts", {}),
        template_targets,
        prompt_max_chars,
    )
    if is_focused_request(body):
        focused_target = template_targets.get(TemplateMode.algorithm.value, "")
        if _should_rewrite_focused_drill(raw, pattern, method, focused_target):
            return attach_plain_english_prompt_detail(
                _focused_drill_from_source(
                    raw=raw,
                    index=index,
                    body=body,
                    source_node=source_node,
                    pattern=pattern,
                    pattern_slug=pattern_slug,
                    method=method,
                ),
                pattern=pattern,
                method=method,
            )

        prompt = _focused_prompt(pattern, method)
        hint = _focused_hint(pattern, method)
        title = _focused_title(pattern, method)
        return attach_plain_english_prompt_detail(
            {
                "id": str(raw.get("id", f"focused-{pattern_slug}-{index + 1}")),
                "title": title,
                "difficulty": _focused_difficulty(pattern, method),
                "prompt": prompt,
                "templatePrompts": {
                    TemplateMode.algorithm.value: prompt,
                    CORE_SHAPE_TEMPLATE_KEY: prompt,
                    INLINE_TEMPLATE_KEY: limit_words(f"{pattern}: add notes", 8),
                },
                "templateTargets": template_targets,
                "solution": solution,
                "missing": missing,
                "hint": hint,
                "tags": tags,
            },
            pattern=pattern,
            method=method,
        )

    selected_prompt = (
        template_prompts.get(template_mode_value(body.templateMode))
        or clean_concise_prompt(str(raw.get("prompt", "")).strip(), prompt_max_chars)
        or template_prompt_from_target(
            pattern,
            pattern_slug,
            template_mode_value(body.templateMode),
            solution.replace("{{missing}}", missing),
        )
    )
    return attach_plain_english_prompt_detail(
        {
            "id": str(raw.get("id", f"skill-map-{index + 1}")),
            "title": question_title or str(raw.get("title", f"Skill Map Card {index + 1}")),
            "difficulty": normalize_drill_difficulty(raw.get("difficulty", "Med.")),
            "prompt": selected_prompt,
            "templatePrompts": template_prompts,
            "templateTargets": template_targets,
            "solution": solution,
            "missing": missing,
            "hint": str(raw.get("hint", "")).strip(),
            "tags": tags,
        },
        pattern=pattern,
        method=method,
    )


def build_generator_context(
    body: SkillMapDrillsRequest,
    progress_summary: SkillMapProgressPayload,
    provider: str,
    provider_label: str,
    tuning: GeneratorTuning | None = None,
) -> GeneratorContext:
    active_tuning = tuning or GeneratorTuning()
    playlist_request = is_playlist_request(body)
    focused_request = is_focused_request(body)
    focused_rule = (
        "For questionType skill-map-targeted, treat each skillMap entry as target-locked: "
        "preserve order, use exactly the provided pattern and first method, keep prompt <= 8 words, "
        "hint <= 12 words, and make the target a reusable 4-8 line skeleton rather than a story problem. "
        if focused_request
        else ""
    )
    system_prompt = (
        "You generate focused Python practice cards for coding interview preparation. "
        "Return only a top-level JSON object shaped exactly like {\"drills\": [...]}. "
        "The drills array must contain exactly the requested count of objects with keys "
        "id, title, difficulty, prompt, templatePrompts, templateTargets, solution, missing, hint, tags. "
        "Do not return a single drill object without the drills wrapper. "
        "Generate exactly one drill for each skillMap entry, in the same order as the skillMap array. "
        "Do not generate a second drill for any pattern until every provided skillMap entry has one drill. "
        f"{focused_rule}"
        "Each drill must teach one reusable LeetCode move from the provided skill map, not a story problem. "
        "If a skillMap entry has questionTitle, generate for that exact question title and keep the returned title exactly equal to questionTitle. "
        "For those playlist entries, treat pattern as the core algorithm shape and methods as implementation hints. "
        "Use the generationSeed and shuffled method order to vary titles, snippets, missing lines, and selected methods across calls. "
        "Make them concise and pattern-first. Prioritize patterns with low readiness or high error rates, "
        "then fill remaining slots across remaining patterns. "
        "The solution must include exactly one '{{missing}}' placeholder, and missing must be the exact code that replaces it. "
        f"The prompt must be very short: {active_tuning.output.concise_prompt_words} words or fewer. "
        "templateTargets may include algorithm, coreShape, and inline. "
        "The coreShape target is a question-specific reusable skeleton worth memorizing beneath the full solution. "
        "coreShape must remove story glue, setup clutter, and one-off wrapper code when those are not part of the reusable algorithm. "
        "For nested DFS/backtracking, prefer the helper skeleton itself, such as def dfs(i): with base case, skip/take branches, recurse, and undo. "
        "For other patterns, keep the minimal loop/recurrence/frontier/boundary skeleton that transfers to nearby LeetCode problems. "
        "coreShape must still be Python-like and executable when practical, but it may use generic names like n, path, state, left, right, or record(path). "
        "Inline is a separate progressive helper layer. If you include templateTargets.inline, it should be the algorithm target with one aligned conceptual task for every nonempty code line. "
        "Any comments or explanatory notes in generated targets should be short '#' comments or aligned side-notes so the UI can render them only in Inline mode. "
        "Each Inline task should gently describe what the user should accomplish next without revealing exact code, identifiers, or syntax. "
        "Inline tasks must be one concise sentence of 16 words or fewer and include the function signature, routine temporaries, guards, assignments, returns, and loop headers. "
        "Never use generic notes like 'update state for next decision', 'move through core step', or 'return final answer'. "
        "Decision notes must avoid legacy mode labels. "
        "All generated Python targets must follow PEP 8: 4-space indentation, snake_case names, spaces around operators, spaces after commas, and readable names like queue, output, and neighbor instead of q, out, and ngbr. "
        f"{specimen_style_prompt(body.specimenTuning)} "
        "When you return templateTargets, make algorithm the full specimen, coreShape the memorized skeleton, and inline the annotated full specimen. "
        "templatePrompts must be an object keyed by algorithm, coreShape, and inline when those targets are provided. "
        "Each templatePrompts value should briefly say why the pattern helps and then name the key move. "
        "For example, a binary search prompt should feel like 'exploit sorted data; discard half each step.' "
        f"Keep each templatePrompts value concise, ideally {max(8, active_tuning.output.concise_prompt_words - 4)} to {active_tuning.output.concise_prompt_words} words, "
        "and make it describe the exact provided template target, not a legacy or story prompt. "
        "Keep snippets short enough to memorize, but realistic enough to reuse in senior-level interviews. "
        "Tags must include 'skill-map' and a slug for the pattern. "
        "For playlist entries, also include the playlistSlug and a slug for the questionTitle."
    )

    rng = random.SystemRandom()
    generation_seed = f"{datetime.now(tz=timezone.utc).strftime('%Y%m%d%H%M%S%f')}-{rng.randrange(1_000_000)}"
    generation_skill_map = list(body.skillMap[: body.count])
    if not playlist_request and not focused_request:
        rng.shuffle(generation_skill_map)
    trimmed_skill_map = [
        {
            "pattern": node.algorithm,
            "methods": (
                list(node.skills)
                if playlist_request or focused_request
                else rng.sample(list(node.skills), len(node.skills)) if node.skills else []
            ),
            "questionTitle": node.questionTitle,
            "playlistSlug": node.playlistSlug,
        }
        for node in generation_skill_map
    ]
    pattern_progress = {
        slug: data
        for slug, data in progress_summary.get("patterns", {}).items()
        if data.get("attemptCount", 0) > 0 or data.get("readiness", 100) < active_tuning.output.readiness_threshold
    }
    if active_tuning.cost.pattern_history_limit > 0:
        sorted_items = sorted(
            pattern_progress.items(),
            key=lambda item: (item[1].get("attemptCount", 0), 100 - float(item[1].get("readiness", 100) or 100)),
            reverse=True,
        )
        pattern_progress = dict(sorted_items[: active_tuning.cost.pattern_history_limit])
    llm_payload = {
        "questionType": body.questionType,
        "count": body.count,
        "generationSeed": generation_seed,
        "templateMode": template_mode_value(body.templateMode),
        "templateTargets": body.templateTargets,
        "specimenTuning": normalize_specimen_tuning(body.specimenTuning),
        "skillMap": trimmed_skill_map,
        "practiceHistory": {
            "overall": progress_summary.get("overall", {}),
            "patterns": pattern_progress,
        },
        "schema": {
            "fields": ["id", "title", "difficulty", "prompt", "templatePrompts", "templateTargets", "solution", "missing", "hint", "tags", "plainEnglishPromptDetail"],
            "constraint": "solution must contain exactly one {{missing}} placeholder",
            "coverage": "drills[i] must correspond to skillMap[i]",
            "variation": (
                "for focused decks, vary only the skeleton code while staying anchored to the selected method"
                if focused_request
                else "avoid reusing the same title, prompt, missing line, or exact snippet shape from a previous generation"
            ),
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
        output_tuning=active_tuning.output,
    )


def _invalid_response_error(context: GeneratorContext) -> LlmUnavailableError:
    return LlmUnavailableError(
        code="coach_llm_invalid_response",
            message=f"Skill-map practice cards cannot be generated at this time. Invalid response from {context.provider_label}.",
        provider=context.provider,
        api_error_code="provider_invalid_json",
    )


def _fallback_template_for_pattern(pattern: str, method_hint: str, prompt_max_chars: int = 80) -> SkillMapDrillPayload:
    slug = slugify(pattern) or "pattern"
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
        "prompt": clean_concise_prompt(f"Algorithm: recall {func}_template(nums).", prompt_max_chars),
        "solution": solution,
        "missing": "result.append(value)",
        "hint": f"Focus on reproducing the reusable {pattern.lower()} scaffold from memory.",
        "tags": ["skill-map", slug],
    }


def fallback_skill_map_drills(context: GeneratorContext) -> SkillMapDrillsEnvelope:
    drills: list[SkillMapDrillPayload] = []
    nodes = context.body.skillMap[: context.body.count]
    if not nodes:
        nodes = [type("Node", (), {"algorithm": "algorithm", "skills": []})()]

    progress_by_pattern = context.progress_summary.get("patterns", {}) if isinstance(context.progress_summary, dict) else {}
    for index, node in enumerate(nodes):
        pattern = str(getattr(node, "algorithm", "algorithm") or "algorithm")
        methods = list(getattr(node, "skills", []) or [])
        question_title = str(getattr(node, "questionTitle", "") or "").strip()
        playlist_slug = str(getattr(node, "playlistSlug", "") or "").strip()
        method_hint = str(methods[0]).strip() if methods else "core method"
        if is_focused_request(context.body):
            drills.append(
                attach_plain_english_prompt_detail(
                    _focused_drill_from_source(
                        raw=None,
                        index=index,
                        body=context.body,
                        source_node=node,
                        pattern=pattern,
                        pattern_slug=slugify(pattern),
                        method=method_hint,
                    ),
                    pattern=pattern,
                    method=method_hint,
                )
            )
            continue
        base = _fallback_template_for_pattern(pattern, method_hint, context.output_tuning.prompt_max_chars)
        slug = slugify(pattern)
        progress = progress_by_pattern.get(slug, {}) if slug else {}
        difficulty = "Easy" if float(progress.get("successRate", 100) or 100) < 80 else base["difficulty"]

        template_targets = template_targets_for_drill(
            context.body,
            slug,
            base["solution"],
            base["missing"],
        )
        template_prompts = template_prompt_map(
            context.body,
            pattern,
            slug,
            base["solution"],
            base["missing"],
            template_targets=template_targets,
            prompt_max_chars=context.output_tuning.prompt_max_chars,
        )
        selected_prompt = template_prompts.get(template_mode_value(context.body.templateMode)) or base["prompt"]

        drills.append(
            attach_plain_english_prompt_detail(
                {
                "id": f"skill-map-fallback-{index + 1}",
                "title": question_title or base["title"],
                "difficulty": difficulty,
                "prompt": selected_prompt,
                "templatePrompts": template_prompts,
                "templateTargets": template_targets,
                "solution": base["solution"],
                "missing": base["missing"],
                "hint": base["hint"],
                "tags": [
                    *base["tags"],
                    *([playlist_slug] if playlist_slug else []),
                    *([question_slug(question_title)] if question_title else []),
                ],
                },
                pattern=pattern,
                method=method_hint,
            )
        )

    return {"drills": drills, "llmUsed": False}


async def generate_skill_map_drills(context: GeneratorContext, runtime: GeneratorRuntime) -> SkillMapDrillsEnvelope:
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
        raise LlmUnavailableError(
            code="coach_llm_no_response",
            message=f"Skill-map practice cards cannot be generated at this time. No response from {context.provider_label}.",
            provider=context.provider,
            api_error_code="provider_empty_response",
        )

    drills: list[SkillMapDrillPayload] = []
    for index, raw in enumerate(llm_response["drills"][: context.body.count]):
        processed = _process_raw_drill(
            raw,
            index,
            context.body,
            context.generation_skill_map,
            context.output_tuning.prompt_max_chars,
        )
        if not processed:
            raise _invalid_response_error(context)
        drills.append(processed)

    expected = min(context.body.count, len(context.generation_skill_map))
    if len(drills) != expected:
        raise _invalid_response_error(context)

    return {"drills": drills, "llmUsed": True}


def stamp_skill_map_drills(drills: list[SkillMapDrillPayload]) -> list[SkillMapDrillPayload]:
    stamp = datetime.now(tz=timezone.utc).strftime("%Y%m%d%H%M%S%f")
    stamped: list[SkillMapDrillPayload] = []
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


def _stamped_stream_drill(context: GeneratorContext, drill: SkillMapDrillPayload, index: int) -> SkillMapDrillPayload:
    tags = [str(t) for t in drill.get("tags", [])]
    if "skill-map" not in tags:
        tags = ["skill-map", *tags]
    return {
        **drill,
        "id": f"skill-map-{context.stamp_prefix}-{index + 1}",
        "tags": tags,
        "questionType": context.body.questionType,
    }


def runtime_with_tuning(runtime: GeneratorRuntime, tuning: GeneratorTuning | None = None) -> GeneratorRuntime:
    active = tuning or GeneratorTuning()
    return replace(
        runtime,
        drill_gen_max_tokens=active.cost.max_tokens,
        drill_gen_openai_timeout_seconds=active.cost.timeout_seconds,
        drill_gen_temperature=active.cost.temperature,
    )


class SkillMapDrillGenerator:
    def __init__(self, runtime: GeneratorRuntime, tuning: GeneratorTuning | None = None):
        self.runtime = runtime
        self.tuning = tuning or GeneratorTuning()

    async def generate_response(
        self,
        body: SkillMapDrillsRequest,
        progress_summary: SkillMapProgressPayload,
        provider: str,
        provider_label: str,
        provider_available: bool,
    ) -> SkillMapDrillsEnvelope:
        context = build_generator_context(body, progress_summary, provider, provider_label, self.tuning)
        runtime = runtime_with_tuning(self.runtime, self.tuning)
        if provider_available:
            try:
                drills = await generate_skill_map_drills(context, runtime)
            except LlmUnavailableError:
                drills = fallback_skill_map_drills(context)
        else:
            drills = fallback_skill_map_drills(context)

        stamped = stamp_skill_map_drills(drills["drills"])
        stamped = [{**drill, "questionType": body.questionType} for drill in stamped]
        await runtime.persist_skill_map_drills(stamped, bool(drills.get("llmUsed")), progress_summary)
        return {"drills": stamped, "llmUsed": bool(drills.get("llmUsed"))}

    def stream_response(
        self,
        body: SkillMapDrillsRequest,
        progress_summary: SkillMapProgressPayload,
        provider: str,
        provider_label: str,
        provider_available: bool,
    ) -> AsyncIterator[str]:
        context = build_generator_context(body, progress_summary, provider, provider_label, self.tuning)
        runtime = runtime_with_tuning(self.runtime, self.tuning)
        if not provider_available:
            return skill_map_drills_fallback_stream_response(context, runtime)
        return skill_map_drills_stream_response(context, runtime)


def skill_map_drills_stream_response(context: GeneratorContext, runtime: GeneratorRuntime) -> AsyncIterator[str]:
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
                        for token in stream_openai_text(
                            context.system_prompt,
                            context.llm_payload,
                            runtime.drill_gen_max_tokens,
                            runtime.drill_gen_openai_timeout_seconds,
                            runtime.drill_gen_temperature,
                        ):
                            new_drills = parser.feed(token)
                            for raw_drill in new_drills:
                                processed = _process_raw_drill(
                                    raw_drill,
                                    drill_index,
                                    context.body,
                                    context.generation_skill_map,
                                    context.output_tuning.prompt_max_chars,
                                )
                                if processed:
                                    stamped = _stamped_stream_drill(context, processed, drill_index)
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
                            processed = _process_raw_drill(
                                raw_drill,
                                drill_index,
                                context.body,
                                context.generation_skill_map,
                                context.output_tuning.prompt_max_chars,
                            )
                            if processed:
                                stamped = _stamped_stream_drill(context, processed, drill_index)
                                q.put(("drill", {"index": drill_index, "drill": stamped, "total": total_drills}))
                                drill_index += 1

                if drill_index < total_drills:
                    if drill_index == 0:
                        llm_used = False
                    fallback = fallback_skill_map_drills(context)
                    for raw_drill in fallback["drills"][drill_index:total_drills]:
                        stamped = _stamped_stream_drill(context, raw_drill, drill_index)
                        q.put(("drill", {"index": drill_index, "drill": stamped, "total": total_drills}))
                        drill_index += 1

                q.put(("done", {"count": drill_index, "llmUsed": llm_used}))
            except Exception as exc:
                if runtime.logger:
                    runtime.logger.exception("Drill stream generation failed")
                q.put(("error", str(exc)))

        loop = asyncio.get_event_loop()
        future = loop.run_in_executor(None, _blocking)
        all_drills: list[SkillMapDrillPayload] = []

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

    return generate()


def skill_map_drills_fallback_stream_response(context: GeneratorContext, runtime: GeneratorRuntime) -> AsyncIterator[str]:
    total_drills = min(context.body.count, max(1, len(context.body.skillMap[: context.body.count])))

    async def generate():
        fallback = fallback_skill_map_drills(context)
        stamped: list[SkillMapDrillPayload] = []
        for index, raw_drill in enumerate(fallback["drills"][: context.body.count]):
            tags = [str(t) for t in raw_drill.get("tags", [])]
            if "skill-map" not in tags:
                tags = ["skill-map", *tags]
            drill = {
                **raw_drill,
                "id": f"skill-map-{context.stamp_prefix}-{index + 1}",
                "tags": tags,
                "questionType": context.body.questionType,
            }
            stamped.append(drill)
            yield f"event: drill\ndata: {json.dumps({'index': index, 'drill': drill, 'total': total_drills})}\n\n"

        await runtime.persist_skill_map_drills(stamped, False, context.progress_summary)
        yield f"event: done\ndata: {json.dumps({'count': len(stamped), 'llmUsed': False})}\n\n"

    return generate()
