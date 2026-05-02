from __future__ import annotations

import asyncio
import json
import logging
import queue as thread_queue
import random
import re
import urllib.request
from collections.abc import Awaitable, Callable, Generator
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from typing import Any

from fastapi.responses import StreamingResponse

from app.config import settings
from app.models import SkillMapDrillsRequest, TemplateMode

INLINE_NOTE_COLUMN = 48

TEMPLATE_MODE_ORDER = (
    TemplateMode.algorithm.value,
)
INLINE_TEMPLATE_KEY = "inline"
TEMPLATE_TARGET_ORDER = (TemplateMode.algorithm.value, INLINE_TEMPLATE_KEY)


class GeneratorUnavailableError(RuntimeError):
    def __init__(self, code: str, message: str, provider: str, api_error_code: str = ""):
        super().__init__(message)
        self.code = code
        self.message = message
        self.provider = provider
        self.api_error_code = api_error_code


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
    progress_summary: dict[str, Any]
    generation_skill_map: list[Any]
    llm_payload: dict[str, Any]
    system_prompt: str
    stamp_prefix: str
    output_tuning: GeneratorOutputTuning


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
    match = re.match(r"def\s+([A-Za-z_]\w*)\s*\(([^)]*)\):", first_line)
    return f"{match.group(1)}({match.group(2)})" if match else ""


def _shorten_annotation_note(value: str, max_words: int = 8) -> str:
    cleaned = re.sub(r"#\s*", "", str(value or ""))
    cleaned = re.sub(r"\bINVARIANT\s*:\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"[.]+$", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return " ".join(cleaned.split()[:max_words]) if cleaned else ""


def _inline_decision_note_for_pattern(pattern_slug: str) -> str:
    return {
        "sliding-window": "window valid before scoring",
        "two-pointers": "answer stays inside pointers",
        "binary-search": "answer stays inside bounds",
        "dynamic-programming": "take skip summarize processed prefix",
        "dp": "take skip summarize processed prefix",
        "graph-traversal": "frontier holds unvisited work",
        "dfs-bfs": "frontier holds unvisited work",
        "backtracking": "path matches current branch",
        "heap": "heap holds current top-k",
        "union-find": "roots name connected groups",
        "intervals": "merged tail alone can overlap",
        "prefix-sums": "seen holds previous prefixes",
        "monotonic-stack": "stack keeps unresolved decreasing values",
        "stack": "stack keeps unresolved decreasing values",
    }.get(pattern_slug, "state preserves valid updates")


def _inline_note_for_line(trimmed_line: str, pattern_slug: str) -> str:
    if re.match(r"^return\b", trimmed_line):
        if re.search(r"max\(take,\s*skip\)", trimmed_line):
            return "best of final choices"
        if re.search(r"return\s+0\b", trimmed_line):
            return "nothing to choose"
        return "return final answer"
    if re.match(r"^while\b", trimmed_line):
        return "restore rule before continuing"
    if re.match(r"^(def|for|if|elif|else)\b", trimmed_line):
        return ""
    if pattern_slug in {"dynamic-programming", "dp"}:
        if re.match(r"^take\s*=\s*0\b", trimmed_line):
            return "best if previous was taken"
        if re.match(r"^skip\s*=\s*0\b", trimmed_line):
            return "best if previous was skipped"
        if re.search(r"take\s*,\s*skip\s*=", trimmed_line):
            return "take x or skip x"
        if re.search(r"dp\[|transition", trimmed_line):
            return "build from solved states"
    if pattern_slug == "heap" and re.search(r"heappush", trimmed_line):
        return "include new candidate"
    if pattern_slug == "heap" and re.search(r"heappop", trimmed_line):
        return "drop smallest kept item"
    if pattern_slug == "binary-search" and re.search(r"mid\s*=", trimmed_line):
        return "probe middle boundary"
    if pattern_slug == "binary-search" and re.search(r"left\s*=\s*mid", trimmed_line):
        return "discard lower half"
    if pattern_slug == "binary-search" and re.search(r"right\s*=\s*mid", trimmed_line):
        return "keep possible boundary"
    if re.search(r"\+=|-=|\*=|/=|=", trimmed_line):
        return "update state for next decision"
    if re.search(r"\b(append|push|pop|add|remove|union|find)\b", trimmed_line):
        return "move through core step"
    if pattern_slug == "union-find" and re.match(r"^(parent|rank)\b", trimmed_line):
        return "self-label before merging"
    return ""


def _append_aligned_note(line: str, note: str) -> str:
    compact_note = _shorten_annotation_note(note)
    if not compact_note:
        return line
    trimmed_right = line.rstrip()
    if not trimmed_right:
        return f"{' ' * INLINE_NOTE_COLUMN}{compact_note}"
    padding = " " * max(2, INLINE_NOTE_COLUMN - len(trimmed_right))
    return f"{trimmed_right}{padding}{compact_note}"


INLINE_GENERIC_NOTES = (
    "update state for next decision",
    "return final answer",
    "restore rule before continuing",
    "move through core step",
    "choose rule-preserving branch",
    "repeat until state settles",
    "state depends on solved states",
)


def _remove_duplicate_inline_notes(note: str) -> str:
    cleaned = str(note or "").strip()
    for generic_note in INLINE_GENERIC_NOTES:
        escaped = re.escape(generic_note)
        cleaned = re.sub(rf"\b{escaped}\s+{escaped}\b", generic_note, cleaned, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", cleaned).strip()


def _strip_known_inline_note(line: str) -> str:
    lower = line.lower()
    indexes = [lower.find(note.lower()) for note in INLINE_GENERIC_NOTES if lower.find(note.lower()) >= 0]
    return line[: min(indexes)].rstrip() if indexes else line


def _has_aligned_inline_note(line: str) -> bool:
    return bool(re.search(r".*\S\s{6,}\S", line) or re.match(rf"^\s{{{INLINE_NOTE_COLUMN},}}\S", line))


def _append_inline_note(line: str, pattern_slug: str) -> str:
    if _has_aligned_inline_note(line):
        note_only = re.match(rf"^(\s{{{INLINE_NOTE_COLUMN},}})(\S.*)$", line)
        if note_only:
            cleaned_note = _remove_duplicate_inline_notes(note_only.group(2))
            if any(note.lower() == cleaned_note.lower() for note in INLINE_GENERIC_NOTES):
                return _append_aligned_note("", _inline_decision_note_for_pattern(pattern_slug))
            return _append_aligned_note("", cleaned_note)
        match = re.match(r"^(.*?\S)(\s{6,})(\S.*)$", line)
        if not match:
            return line.rstrip()
        code = match.group(1)
        cleaned_note = _remove_duplicate_inline_notes(match.group(3))
        if any(note.lower() == cleaned_note.lower() for note in INLINE_GENERIC_NOTES):
            comment = _inline_note_for_line(code.strip(), pattern_slug)
            return _append_aligned_note(code, comment)
        return _append_aligned_note(code, cleaned_note)
    if "#" in line:
        before_comment, existing_note = line.split("#", 1)
        return _append_aligned_note(before_comment, existing_note)
    cleaned_line = _strip_known_inline_note(line)
    trimmed_line = cleaned_line.strip()
    if not trimmed_line:
        return line
    comment = _inline_note_for_line(trimmed_line, pattern_slug)
    return _append_aligned_note(cleaned_line, comment)


def _is_inline_decision_line(line: str) -> bool:
    match = re.match(rf"^\s{{{INLINE_NOTE_COLUMN},}}(\S.*)$", line)
    if not match:
        return False
    return bool(re.search(r"\b(window|answer|state|frontier|path|heap|roots|merged|seen|stack|take|skip)\b", match.group(1), re.IGNORECASE))


def _should_place_inline_decision_note_after(line: str, inside_loop: bool) -> bool:
    if not inside_loop:
        return False
    code_part = line.split("#", 1)[0].strip()
    if not code_part:
        return False
    if re.match(r"^(def|for|while|if|elif|else|return)\b", code_part):
        return False
    return bool(
        re.search(r"\b(heappush|append|add|push|union|find|pop|popleft|transition)\b", code_part)
        or re.search(r"[+\-*/]?=", code_part)
    )


def _inline_template_target(pattern_slug: str, algorithm_target: str) -> str:
    lines = str(algorithm_target or "").replace("\r\n", "\n").strip().split("\n")
    output: list[str] = []
    inline_decision_inserted = False
    inside_loop = False
    for line in lines:
        if re.match(r"^\s*(for|while)\b", line):
            inside_loop = True
        next_line = _append_inline_note(line, pattern_slug)
        output.append(next_line)
        if _is_inline_decision_line(next_line):
            inline_decision_inserted = True
        if not inline_decision_inserted and _should_place_inline_decision_note_after(line, inside_loop):
            output.append(_append_aligned_note("", _inline_decision_note_for_pattern(pattern_slug)))
            inline_decision_inserted = True
    if not inline_decision_inserted:
        def_index = next((index for index, line in enumerate(lines) if re.match(r"^\s*def\s+", line)), -1)
        if def_index >= 0:
            output.insert(def_index + 1, _append_aligned_note("", _inline_decision_note_for_pattern(pattern_slug)))
        else:
            output.insert(0, _append_aligned_note("", _inline_decision_note_for_pattern(pattern_slug)))
    return "\n".join(output).strip()


def _normalize_inline_template_target(pattern_slug: str, raw_target: str) -> str:
    lines = str(raw_target or "").replace("\r\n", "\n").strip().split("\n")
    output = [_append_inline_note(line, pattern_slug) for line in lines]
    if any(_is_inline_decision_line(line) for line in output):
        return "\n".join(output).strip()

    inside_loop = False
    inline_decision_index = -1
    for index, line in enumerate(lines):
        if re.match(r"^\s*(for|while)\b", line):
            inside_loop = True
            continue
        if _should_place_inline_decision_note_after(line, inside_loop):
            inline_decision_index = index
            break

    if inline_decision_index >= 0:
        output.insert(inline_decision_index + 1, _append_aligned_note("", _inline_decision_note_for_pattern(pattern_slug)))
    else:
        def_index = next((index for index, line in enumerate(lines) if re.match(r"^\s*def\s+", line)), -1)
        if def_index >= 0:
            output.insert(def_index + 1, _append_aligned_note("", _inline_decision_note_for_pattern(pattern_slug)))
        else:
            output.insert(0, _append_aligned_note("", _inline_decision_note_for_pattern(pattern_slug)))
    return "\n".join(output).strip()


def _pattern_prompt_focus(pattern_slug: str, template_mode: str) -> str:
    focus_by_pattern = {
        "sliding-window": {
            TemplateMode.algorithm.value: "code the expand/shrink/update-best loop",
            INLINE_TEMPLATE_KEY: "code the loop with decision and memory notes",
        },
        "two-pointers": {
            TemplateMode.algorithm.value: "code the inward pointer scan",
            INLINE_TEMPLATE_KEY: "code pointer movement with decision notes",
        },
        "binary-search": {
            TemplateMode.algorithm.value: "code the midpoint discard loop",
            INLINE_TEMPLATE_KEY: "code search with boundary and discard notes",
        },
        "dynamic-programming": {
            TemplateMode.algorithm.value: "code the state-transition loop",
            INLINE_TEMPLATE_KEY: "code transitions with state-meaning comments",
        },
        "dp": {
            TemplateMode.algorithm.value: "code the state-transition loop",
            INLINE_TEMPLATE_KEY: "code transitions with state-meaning comments",
        },
        "graph-traversal": {
            TemplateMode.algorithm.value: "code the frontier plus visited loop",
            INLINE_TEMPLATE_KEY: "code traversal with frontier notes",
        },
        "dfs-bfs": {
            TemplateMode.algorithm.value: "code the frontier plus visited loop",
            INLINE_TEMPLATE_KEY: "code traversal with frontier notes",
        },
        "backtracking": {
            TemplateMode.algorithm.value: "code the choose/recurse/undo loop",
            INLINE_TEMPLATE_KEY: "code backtracking with path notes",
        },
        "heap": {
            TemplateMode.algorithm.value: "code the push/prune heap loop",
            INLINE_TEMPLATE_KEY: "code heap updates with decision notes",
        },
        "union-find": {
            TemplateMode.algorithm.value: "code the find/union component loop",
            INLINE_TEMPLATE_KEY: "code union-find with component comments",
        },
        "intervals": {
            TemplateMode.algorithm.value: "code the sort-and-merge sweep",
            INLINE_TEMPLATE_KEY: "code merging with ordering notes",
        },
        "prefix-sums": {
            TemplateMode.algorithm.value: "code the prefix query loop",
            INLINE_TEMPLATE_KEY: "code prefix lookup with state notes",
        },
        "monotonic-stack": {
            TemplateMode.algorithm.value: "code the pop-then-push stack loop",
            INLINE_TEMPLATE_KEY: "code stack updates with decision notes",
        },
        "stack": {
            TemplateMode.algorithm.value: "code the pop-then-push stack loop",
            INLINE_TEMPLATE_KEY: "code stack updates with decision notes",
        },
    }
    default_focus = {
        TemplateMode.algorithm.value: "code the reusable pattern loop",
        INLINE_TEMPLATE_KEY: "code the pattern with decision and memory notes",
    }
    return focus_by_pattern.get(pattern_slug, default_focus).get(template_mode, default_focus[TemplateMode.algorithm.value])


def _pattern_prompt_spirit(pattern_slug: str) -> str:
    spirit_by_pattern = {
        "sliding-window": "turn one pass into a valid-range search",
        "two-pointers": "use order to eliminate the losing side",
        "binary-search": "exploit sorted data by discarding half",
        "dynamic-programming": "reuse solved state instead of recomputing",
        "dp": "reuse solved state instead of recomputing",
        "graph-traversal": "expand the frontier and visit each state once",
        "dfs-bfs": "expand the frontier and visit each state once",
        "backtracking": "explore choices cleanly and undo without drift",
        "heap": "keep the best candidates at the top",
        "union-find": "treat components as roots and merge fast",
        "intervals": "sort boundaries so overlap becomes local",
        "prefix-sums": "turn range sums into constant-time lookups",
        "monotonic-stack": "keep only candidates that still matter",
        "stack": "keep only candidates that still matter",
    }
    return spirit_by_pattern.get(pattern_slug, "lean on the reusable pattern instead of brute force")


def _template_prompt_from_target(pattern: str, pattern_slug: str, template_mode: str, target: str) -> str:
    pattern_label = re.sub(r"\s+", " ", str(pattern or "").strip()) or "Algorithm"
    pattern_label = pattern_label[0].upper() + pattern_label[1:] if pattern_label else "Algorithm"
    spirit = _pattern_prompt_spirit(pattern_slug)
    focus = _pattern_prompt_focus(pattern_slug, template_mode)
    return f"{pattern_label}: {spirit}; {focus}."


def _prompt_mentions_pattern_or_move(prompt: str, pattern_slug: str, target: str) -> bool:
    normalized = re.sub(r"[^a-z0-9_+\-\s]", " ", prompt.lower())
    tokens = {token for token in normalized.split() if len(token) >= 3}
    pattern_tokens = {token for token in pattern_slug.replace("-", " ").split() if len(token) >= 3}
    entry_tokens = {
        token
        for token in re.sub(r"[^a-z0-9_+\-\s]", " ", _entry_point_from_template_target(TemplateMode.algorithm.value, target).lower()).split()
        if len(token) >= 3
    }
    move_tokens = {
        "window", "shrink", "expand", "pointer", "midpoint", "interval", "frontier", "visited",
        "recurse", "undo", "heap", "prefix", "stack", "merge", "union", "state", "transition",
    }
    return bool(tokens & (pattern_tokens | entry_tokens | move_tokens))


def _prompt_is_generic(raw_prompt: str, pattern_slug: str, template_mode: str, target: str) -> bool:
    normalized = re.sub(r"\s+", " ", raw_prompt.lower()).strip()
    if not normalized:
        return True
    generic_phrases = (
        "fill ",
        "complete ",
        "write ",
        "type ",
        "recall ",
        "rebuild ",
        "remember ",
    )
    generic_nouns = ("template", "scaffold", "outline", "algorithm", "code", "prompt")
    if (
        len(normalized.split()) <= 7
        and any(normalized.startswith(phrase) for phrase in generic_phrases)
        and any(noun in normalized for noun in generic_nouns)
        and not _prompt_mentions_pattern_or_move(normalized, pattern_slug, target)
    ):
        return True
    return False


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
        if mode in TEMPLATE_TARGET_ORDER and str(target).strip()
    }
    if isinstance(raw_template_targets, dict):
        for mode, target in raw_template_targets.items():
            if mode in TEMPLATE_TARGET_ORDER and str(target).strip():
                targets[mode] = str(target).replace("\r\n", "\n").replace("{{missing}}", str(missing or "")).strip()
    algorithm_target = str(solution or "").replace("{{missing}}", str(missing or "")).strip()
    if algorithm_target:
        targets[TemplateMode.algorithm.value] = algorithm_target
        targets.setdefault(INLINE_TEMPLATE_KEY, _inline_template_target(pattern_slug, algorithm_target))
    if targets.get(INLINE_TEMPLATE_KEY):
        targets[INLINE_TEMPLATE_KEY] = _normalize_inline_template_target(pattern_slug, targets[INLINE_TEMPLATE_KEY])
    return targets


def _template_prompt_map(
    body: SkillMapDrillsRequest,
    pattern: str,
    pattern_slug: str,
    solution: str,
    missing: str,
    raw_template_prompts: Any = None,
    template_targets: dict[str, str] | None = None,
    prompt_max_chars: int = 80,
) -> dict[str, str]:
    targets = template_targets or _template_targets_for_drill(body, pattern_slug, solution, missing)
    raw_prompts = raw_template_prompts if isinstance(raw_template_prompts, dict) else {}
    prompts: dict[str, str] = {}

    for mode in TEMPLATE_TARGET_ORDER:
        raw_prompt = _clean_concise_prompt(str(raw_prompts.get(mode, "")).strip(), prompt_max_chars)
        target = targets.get(mode, "")
        if raw_prompt and not _prompt_is_generic(raw_prompt, pattern_slug, mode, target):
            prompts[mode] = raw_prompt
            continue
        if target:
            prompts[mode] = _template_prompt_from_target(pattern, pattern_slug, mode, target)
            continue
        if raw_prompt:
            prompts[mode] = raw_prompt

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
    prompt_max_chars: int = 80,
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
    template_prompts = _template_prompt_map(
        body,
        pattern,
        pattern_slug,
        solution,
        missing,
        raw.get("templatePrompts", {}),
        template_targets,
        prompt_max_chars,
    )
    selected_prompt = (
        template_prompts.get(_template_mode_value(body.templateMode))
        or _clean_concise_prompt(str(raw.get("prompt", "")).strip(), prompt_max_chars)
        or _template_prompt_from_target(
            pattern,
            pattern_slug,
            _template_mode_value(body.templateMode),
            solution.replace("{{missing}}", missing),
        )
    )
    return {
        "id": str(raw.get("id", f"skill-map-{index + 1}")),
        "title": str(raw.get("title", f"Skill Map Card {index + 1}")),
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
    tuning: GeneratorTuning | None = None,
) -> GeneratorContext:
    active_tuning = tuning or GeneratorTuning()
    system_prompt = (
        "You generate focused Python practice cards for coding interview preparation. "
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
        f"The prompt must be very short: {active_tuning.output.concise_prompt_words} words or fewer. "
        "templateTargets may include algorithm and inline. "
        "Inline must be Python based on the full algorithm, with aligned subtle side-notes instead of '#' comments. "
        "Inline notes must be 8 words or fewer, and decision notes must avoid legacy mode labels. "
        "When you return templateTargets, make them specific to the drill's pattern and method instead of generic pattern text. "
        "templatePrompts must be an object keyed by algorithm and inline when those targets are provided. "
        "Each templatePrompts value should briefly say why the pattern helps and then name the key move. "
        "For example, a binary search prompt should feel like 'exploit sorted data; discard half each step.' "
        f"Keep each templatePrompts value concise, ideally {max(8, active_tuning.output.concise_prompt_words - 4)} to {active_tuning.output.concise_prompt_words} words, "
        "and make it describe the exact provided template target, not a legacy or story prompt. "
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
        output_tuning=active_tuning.output,
    )


def _invalid_response_error(context: GeneratorContext) -> GeneratorUnavailableError:
    return GeneratorUnavailableError(
        code="coach_llm_invalid_response",
            message=f"Skill-map practice cards cannot be generated at this time. Invalid response from {context.provider_label}.",
        provider=context.provider,
        api_error_code="provider_invalid_json",
    )


def _fallback_template_for_pattern(pattern: str, method_hint: str, prompt_max_chars: int = 80) -> dict[str, Any]:
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
        "prompt": _clean_concise_prompt(f"Algorithm: recall {func}_template(nums).", prompt_max_chars),
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
        base = _fallback_template_for_pattern(pattern, method_hint, context.output_tuning.prompt_max_chars)
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
            prompt_max_chars=context.output_tuning.prompt_max_chars,
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
            message=f"Skill-map practice cards cannot be generated at this time. No response from {context.provider_label}.",
            provider=context.provider,
            api_error_code="provider_empty_response",
        )

    drills: list[dict[str, Any]] = []
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
        progress_summary: dict[str, Any],
        provider: str,
        provider_label: str,
        provider_available: bool,
    ) -> dict[str, Any]:
        context = build_generator_context(body, progress_summary, provider, provider_label, self.tuning)
        runtime = runtime_with_tuning(self.runtime, self.tuning)
        if provider_available:
            try:
                drills = await generate_skill_map_drills(context, runtime)
            except GeneratorUnavailableError:
                drills = fallback_skill_map_drills(context)
        else:
            drills = fallback_skill_map_drills(context)

        stamped = stamp_skill_map_drills(drills["drills"])
        await runtime.persist_skill_map_drills(stamped, bool(drills.get("llmUsed")), progress_summary)
        return {"drills": stamped, "llmUsed": bool(drills.get("llmUsed"))}

    def stream_response(
        self,
        body: SkillMapDrillsRequest,
        progress_summary: dict[str, Any],
        provider: str,
        provider_label: str,
        provider_available: bool,
    ) -> StreamingResponse:
        context = build_generator_context(body, progress_summary, provider, provider_label, self.tuning)
        runtime = runtime_with_tuning(self.runtime, self.tuning)
        if not provider_available:
            return skill_map_drills_fallback_stream_response(context, runtime)
        return skill_map_drills_stream_response(context, runtime)


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
                                processed = _process_raw_drill(
                                    raw_drill,
                                    drill_index,
                                    context.body,
                                    context.generation_skill_map,
                                    context.output_tuning.prompt_max_chars,
                                )
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
                            processed = _process_raw_drill(
                                raw_drill,
                                drill_index,
                                context.body,
                                context.generation_skill_map,
                                context.output_tuning.prompt_max_chars,
                            )
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
