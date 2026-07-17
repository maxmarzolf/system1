from __future__ import annotations

import ast
import asyncio
import io
import json
import logging
import queue as thread_queue
import random
import re
import tokenize
import urllib.request
from collections.abc import AsyncIterator, Awaitable, Callable, Generator
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from typing import Any, TypeAlias, TypedDict

from app.config import settings
from app.core.focused_core_algorithm_cards import (
    focused_difficulty as _focused_difficulty,
    focused_hint as _focused_hint,
    focused_profile as _focused_profile,
    focused_prompt as _focused_prompt,
    focused_skeleton_for_method as _focused_skeleton_for_method,
    focused_target_terms as _focused_target_terms,
    focused_title as _focused_title,
    method_slug as _method_slug,
    pattern_examples as _pattern_examples,
    pattern_family_slug as _pattern_family_slug,
)
from app.models import (
    MultipleChoiceDrillsRequest,
    MultipleChoiceDrillsResponse,
    SkillMapDrillsRequest,
    SkillMapNode,
    TemplateMode,
)

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
    drill_gen_max_tokens: int
    drill_gen_openai_timeout_seconds: int
    drill_gen_temperature: float
    logger: logging.Logger | None = None


def _pattern_slug(pattern: str) -> str:
    return re.sub(
        r"\s+",
        "-",
        re.sub(r"[^a-z0-9\s-]", " ", pattern.lower().replace("/", " ").replace("&", " ").replace("-", " ")).strip(),
    )


def _question_slug(title: str) -> str:
    return _pattern_slug(title)[:72] or "question"


def _is_playlist_request(body: SkillMapDrillsRequest) -> bool:
    return str(body.questionType or "").startswith("playlist:")


def _is_focused_request(body: SkillMapDrillsRequest) -> bool:
    return str(body.questionType or "").strip() == "skill-map-targeted"


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


def _display_label(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", str(value or "").replace("-", " ").replace("_", " ")).strip()
    return cleaned[:1].upper() + cleaned[1:] if cleaned else ""


def _word_count(value: str) -> int:
    return len(re.findall(r"[A-Za-z0-9]+(?:[-/][A-Za-z0-9]+)?", str(value or "")))


def _limit_words(value: str, max_words: int) -> str:
    words = re.findall(r"[A-Za-z0-9]+(?:[-/][A-Za-z0-9]+)?", str(value or ""))
    if len(words) <= max_words:
        return re.sub(r"\s+", " ", str(value or "").strip())
    return " ".join(words[:max_words])


def _method_tokens(method: str) -> set[str]:
    return {
        token
        for token in re.sub(r"[^a-z0-9+\-\s]", " ", str(method or "").lower().replace("/", " ")).split()
        if len(token) >= 3
    }


def _text_anchors_method(value: str, pattern: str, method: str) -> bool:
    normalized = re.sub(r"[^a-z0-9+\-\s]", " ", str(value or "").lower().replace("/", " "))
    tokens = {token for token in normalized.split() if len(token) >= 3}
    method_tokens = _method_tokens(method)
    pattern_tokens = _method_tokens(pattern)
    if method_tokens and tokens & method_tokens:
        return True
    return bool(pattern_tokens and tokens & pattern_tokens and not method_tokens)


def _target_line_count(target: str) -> int:
    return len([line for line in str(target or "").splitlines() if line.strip()])


def _target_looks_story_like(target: str) -> bool:
    lowered = str(target or "").lower()
    return any(
        phrase in lowered
        for phrase in (
            "given ",
            "return the",
            "you are",
            "story",
            "leetcode",
            "example:",
        )
    )


def _target_matches_focused_method(target: str, pattern: str, method: str) -> bool:
    expected_terms = _focused_target_terms(pattern, method)
    if not expected_terms:
        return True
    lowered = str(target or "").lower()
    return any(term.lower() in lowered for term in expected_terms)


SPECIMEN_TUNING_DEFAULTS: dict[str, str] = {
    "typeHints": "omit",
    "comments": "omit",
    "variableNames": "readable",
}


def _normalize_specimen_tuning(raw: Any) -> dict[str, str]:
    tuning = raw if isinstance(raw, dict) else {}
    type_hints = str(tuning.get("typeHints", SPECIMEN_TUNING_DEFAULTS["typeHints"])).strip()
    comments = str(tuning.get("comments", SPECIMEN_TUNING_DEFAULTS["comments"])).strip()
    variable_names = str(tuning.get("variableNames", SPECIMEN_TUNING_DEFAULTS["variableNames"])).strip()
    return {
        "typeHints": type_hints if type_hints in {"omit", "include"} else SPECIMEN_TUNING_DEFAULTS["typeHints"],
        "comments": comments if comments in {"omit", "brief"} else SPECIMEN_TUNING_DEFAULTS["comments"],
        "variableNames": variable_names
        if variable_names in {"readable", "concise", "descriptive"}
        else SPECIMEN_TUNING_DEFAULTS["variableNames"],
    }


def _split_top_level_commas(value: str) -> list[str]:
    parts: list[str] = []
    start = 0
    depth = 0
    quote = ""
    escape = False
    for index, char in enumerate(value):
        if escape:
            escape = False
            continue
        if quote:
            if char == "\\":
                escape = True
            elif char == quote:
                quote = ""
            continue
        if char in {"'", '"'}:
            quote = char
            continue
        if char in "([{":
            depth += 1
        elif char in ")]}":
            depth = max(0, depth - 1)
        elif char == "," and depth == 0:
            parts.append(value[start:index])
            start = index + 1
    parts.append(value[start:])
    return parts


def _split_top_level_once(value: str, delimiter: str) -> tuple[str, str]:
    depth = 0
    quote = ""
    escape = False
    for index, char in enumerate(value):
        if escape:
            escape = False
            continue
        if quote:
            if char == "\\":
                escape = True
            elif char == quote:
                quote = ""
            continue
        if char in {"'", '"'}:
            quote = char
            continue
        if char in "([{":
            depth += 1
        elif char in ")]}":
            depth = max(0, depth - 1)
        elif char == delimiter and depth == 0:
            return value[:index], value[index + 1 :]
    return value, ""


def _strip_param_annotation(param: str) -> str:
    leading = param[: len(param) - len(param.lstrip())]
    trailing = param[len(param.rstrip()) :]
    core = param.strip()
    if not core or core in {"/", "*"}:
        return param
    before_default, default = _split_top_level_once(core, "=")
    before_annotation, _annotation = _split_top_level_once(before_default, ":")
    stripped = before_annotation.strip()
    if default:
        stripped = f"{stripped}={default.strip()}"
    return f"{leading}{stripped}{trailing}"


def _strip_function_signature_hints(line: str) -> str:
    match = re.match(r"^(\s*def\s+\w+\s*\()(.+)(\)\s*)(?:->\s*[^:]+)?(:\s*)$", line)
    if not match:
        return line
    params = ",".join(_strip_param_annotation(part) for part in _split_top_level_commas(match.group(2)))
    return f"{match.group(1)}{params}{match.group(3).strip()}{match.group(4)}"


def _strip_variable_annotation(line: str) -> str:
    indent_match = re.match(r"^(\s*)([A-Za-z_]\w*)\s*:", line)
    if not indent_match:
        return line
    before_default, default = _split_top_level_once(line[indent_match.end() :], "=")
    if not default or not before_default.strip():
        return line
    return f"{indent_match.group(1)}{indent_match.group(2)} = {default.strip()}"


def _strip_python_type_hints(code: str) -> str:
    lines = str(code or "").replace("\r\n", "\n").split("\n")
    output = []
    for line in lines:
        without_signature_hints = _strip_function_signature_hints(line)
        output.append(_strip_variable_annotation(without_signature_hints))
    return "\n".join(output).strip()


def _strip_python_comments(code: str) -> str:
    lines = str(code or "").replace("\r\n", "\n").split("\n")
    try:
        comments = [
            token.start
            for token in tokenize.generate_tokens(io.StringIO("\n".join(lines)).readline)
            if token.type == tokenize.COMMENT
        ]
    except (IndentationError, tokenize.TokenError):
        comments = []
    for row, col in sorted(comments, reverse=True):
        index = row - 1
        if 0 <= index < len(lines):
            lines[index] = lines[index][:col].rstrip()
    return "\n".join(line for line in lines if line.strip()).strip()


def _rename_block_identifier(lines: list[str], start_index: int, old_name: str, new_name: str) -> None:
    if old_name == new_name:
        return
    block_indent = len(lines[start_index]) - len(lines[start_index].lstrip())
    pattern = re.compile(rf"\b{re.escape(old_name)}\b")
    for index in range(start_index, len(lines)):
        if index > start_index:
            stripped = lines[index].strip()
            indent = len(lines[index]) - len(lines[index].lstrip())
            if stripped and indent <= block_indent:
                break
        lines[index] = pattern.sub(new_name, lines[index])


def _apply_variable_name_style(code: str, variable_names: str) -> str:
    if variable_names == "concise":
        return str(code or "").strip()

    lines = str(code or "").replace("\r\n", "\n").split("\n")
    element_name = "value" if variable_names == "descriptive" else "val"
    numeric_name = "num" if variable_names == "descriptive" else "val"
    for index, line in enumerate(lines):
        if re.search(r"\bval\b|\bvalue\b", line):
            continue
        enumerate_match = re.match(r"^(\s*for\s+[A-Za-z_]\w*\s*,\s*)x(\s+in\s+enumerate\(.+\):\s*)$", line)
        if enumerate_match:
            lines[index] = f"{enumerate_match.group(1)}{element_name}{enumerate_match.group(2)}"
            _rename_block_identifier(lines, index, "x", element_name)
            continue
        loop_match = re.match(r"^(\s*for\s+)x(\s+in\s+.+:\s*)$", line)
        if loop_match:
            lines[index] = f"{loop_match.group(1)}{element_name}{loop_match.group(2)}"
            _rename_block_identifier(lines, index, "x", element_name)
            continue
        numeric_loop_match = re.match(r"^(\s*for\s+)n(\s+in\s+nums\s*:\s*)$", line)
        if numeric_loop_match:
            lines[index] = f"{numeric_loop_match.group(1)}{numeric_name}{numeric_loop_match.group(2)}"
            _rename_block_identifier(lines, index, "n", numeric_name)
    return "\n".join(lines).strip()


def _normalize_mcq_difficulty(value: str) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"hard", "difficult"}:
        return "Hard"
    return "Med."


def _normalize_mcq_choice_id(value: Any, fallback_index: int) -> str:
    text = str(value or "").strip().upper()
    if text in {"A", "B", "C", "D"}:
        return text
    return ["A", "B", "C", "D"][fallback_index]


def _strip_unparsed_tuple_assignment_parens(line: str) -> str:
    if " = (" not in line or not line.endswith(")"):
        return line
    prefix, rhs = line.split(" = ", 1)
    if not re.fullmatch(r"\s*[A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)+", prefix):
        return line

    inner = rhs[1:-1]
    depth = 0
    has_top_level_comma = False
    for char in inner:
        if char in "([{":
            depth += 1
        elif char in ")]}":
            depth -= 1
        elif char == "," and depth == 0:
            has_top_level_comma = True
            break
    if not has_top_level_comma:
        return line
    return f"{prefix} = {inner}"


def _normalize_python_snippet_display(code: str) -> str:
    normalized = "\n".join(line.replace("\t", "    ").rstrip() for line in code.strip().splitlines()).strip()
    if not normalized:
        return ""
    try:
        formatted = ast.unparse(ast.parse(normalized))
    except SyntaxError:
        return normalized
    return "\n".join(_strip_unparsed_tuple_assignment_parens(line) for line in formatted.splitlines()).strip()


def _normalize_python_markdown_display(text: str) -> str:
    def replace_fence(match: re.Match[str]) -> str:
        language = str(match.group(1) or "python").strip() or "python"
        raw_code = str(match.group(2) or "")
        normalized_language = language.lower()
        code = (
            _normalize_python_snippet_display(raw_code)
            if normalized_language in {"python", "py"}
            else raw_code.strip()
        )
        return f"```{language}\n{code}\n```"

    return re.sub(r"```([A-Za-z0-9_-]+)?\s*\n?([\s\S]*?)```", replace_fence, text.strip())


def _process_multiple_choice_card(raw: Any, index: int, body: MultipleChoiceDrillsRequest) -> MultipleChoiceQuestionPayload | None:
    if not isinstance(raw, dict):
        return None

    source_node = body.skillMap[index % max(len(body.skillMap), 1)] if body.skillMap else None
    pattern = str(raw.get("pattern") or getattr(source_node, "algorithm", "") or "Algorithm").strip()
    skill = str(raw.get("skill") or "").strip()
    source_methods = list(getattr(source_node, "skills", []) or [])
    if not skill and body.sourceMode == "skill-map" and len(source_methods) == 1:
        skill = str(source_methods[0]).strip()
    pattern_slug = _pattern_slug(pattern) or "algorithm"
    title = str(raw.get("title") or f"{pattern} Multiple Choice").strip()
    question = _normalize_python_markdown_display(str(raw.get("question") or ""))
    explanation = _normalize_python_markdown_display(str(raw.get("explanation") or ""))
    difficulty = _normalize_mcq_difficulty(str(raw.get("difficulty") or body.difficulty))

    raw_choices = raw.get("choices")
    if not isinstance(raw_choices, list) or len(raw_choices) < 4:
        return None

    choices: list[dict[str, str]] = []
    seen_ids: set[str] = set()
    for choice_index, choice in enumerate(raw_choices[:4]):
        if isinstance(choice, dict):
            choice_id = _normalize_mcq_choice_id(choice.get("id"), choice_index)
            text = _normalize_python_markdown_display(str(choice.get("text") or ""))
        else:
            choice_id = ["A", "B", "C", "D"][choice_index]
            text = _normalize_python_markdown_display(str(choice or ""))
        if not text:
            return None
        if choice_id in seen_ids:
            choice_id = ["A", "B", "C", "D"][choice_index]
        seen_ids.add(choice_id)
        choices.append({"id": choice_id, "text": text})

    correct_choice_id = _normalize_mcq_choice_id(raw.get("correctChoiceId"), 0)
    choice_ids = {choice["id"] for choice in choices}
    if correct_choice_id not in choice_ids:
        return None
    if not question or not explanation:
        return None

    random.shuffle(choices)
    label_order = ["A", "B", "C", "D"]
    correct_text = next(choice["text"] for choice in choices if choice["id"] == correct_choice_id)
    choices = [{"id": label_order[i], "text": choice["text"]} for i, choice in enumerate(choices)]
    correct_choice_id = next(choice["id"] for choice in choices if choice["text"] == correct_text)

    raw_tags = [str(tag).strip() for tag in raw.get("tags", []) if str(tag).strip()] if isinstance(raw.get("tags"), list) else []
    tags: list[str] = []
    source_tag = f"source-{body.sourceMode}"
    flow_tag = f"flow-{body.flowMode}"
    skill_slug = _pattern_slug(skill)
    for tag in ["skill-map", "skill-map-mcq", pattern_slug, skill_slug, source_tag, flow_tag, *raw_tags]:
        if tag and tag not in tags:
            tags.append(tag)

    stamp = datetime.now(tz=timezone.utc).strftime("%Y%m%d%H%M%S%f")
    return {
        "id": f"mcq-{stamp}-{index + 1}",
        "title": title,
        "algorithm": pattern,
        "skill": skill,
        "difficulty": difficulty,
        "question": question,
        "choices": choices,
        "correctChoiceId": correct_choice_id,
        "explanation": explanation,
        "tags": tags,
    }


async def generate_multiple_choice_drills_response(
    body: MultipleChoiceDrillsRequest,
    *,
    provider: str,
    provider_label: str,
    provider_available: bool,
    call_llm_json: Callable[[str, LLMJsonPayload, str, int, int, float], LLMJsonResponse | None],
    fallback_providers: list[tuple[str, str, bool]] | None = None,
    provider_timeout_seconds: int = 60,
    retry_delays_seconds: tuple[float, ...] = (0.4, 0.8),
    persist_generated_questions: Callable[[list[MultipleChoiceQuestionPayload]], Awaitable[None]] | None = None,
    logger: logging.Logger | None = None,
) -> MultipleChoiceDrillsResponse:
    provider_candidates = fallback_providers or [(provider, provider_label, provider_available)]
    available_candidates = [candidate for candidate in provider_candidates if candidate[2]]

    if not available_candidates:
        raise GeneratorUnavailableError(
            code="mcq_generation_missing_api_key",
            message=f"Multiple choice questions cannot be generated at this time. No API key is configured for {provider_label}.",
            provider=provider,
            api_error_code="provider_auth_error",
        )

    difficulty = _normalize_mcq_difficulty(body.difficulty)
    generation_seed = datetime.now(tz=timezone.utc).strftime("%Y%m%d%H%M%S%f")
    skill_map = list(body.skillMap[: body.count])
    if not skill_map:
        skill_map = [SkillMapNode(algorithm="Algorithm", skills=[])]
    while len(skill_map) < body.count:
        skill_map.extend(skill_map[: body.count - len(skill_map)])

    source_instruction = (
        "Anchor each drill on the named algorithm pattern itself, not on an individual LeetCode problem. "
        "Questions must test the broader algorithm pattern, invariant, tradeoff, state choice, boundary condition, or debugging insight, not a specific core algorithm memorized fact. "
    )
    if body.sourceMode == "skill-map":
        source_instruction = (
            "Anchor each drill on one specific method supplied in the skill map. "
            "Set the drill's skill field to that exact method and isolate the decision that demonstrates it. "
        )
    if body.sourceMode == "card":
        source_instruction = (
            "Anchor every drill on the provided specimenContext. The specimen prompt and target code are the source of truth. "
            "Questions should test why that exact specimen works: its invariant, state variables, loop or branch decisions, boundary handling, and likely implementation mistakes. "
            "Do not drift into unrelated LeetCode problems or generic pattern trivia unless it directly explains the specimen. "
        )

    focus_instruction = ""
    if body.sourceMode == "card" and body.specimen and body.specimen.focus and body.specimen.focus.missedLines:
        focus_instruction = (
            "The provided specimenContext also includes missed lines from the learner's prior recall attempt. "
            "Treat those missed lines as the remediation target for this sequence. "
            "Most drills should directly test why a missed line exists, what bug the learner's drift would cause, how to repair it, or what invariant that line protects. "
            "Do not ignore the missed lines in favor of generic specimen trivia. "
        )

    flow_instruction = (
        "Create a varied but balanced set across the requested patterns or specimen facets. "
        "Avoid near-duplicates while keeping coverage even. "
    )
    if body.flowMode == "progressive":
        flow_instruction = (
            "Order the drills as a Socratic chain. Drill 1 should establish the key idea. "
            "Each later drill must build directly on the immediately previous drill by deepening, challenging, or applying that prior concept. "
            "The set should still be answerable one question at a time, but the sequence must feel intentionally cumulative. "
        )

    system_prompt = (
        "You generate multiple-choice cards for algorithm pattern recognition and reasoning. "
        "Return only a top-level JSON object shaped exactly like {\"drills\": [...]}. "
        "The drills array must contain exactly the requested count. "
        "Each drill must have id, title, pattern, skill, difficulty, question, choices, correctChoiceId, explanation, and tags. "
        "Skill must name the single method from the supplied skill map that the drill primarily tests. "
        "Each choices array must contain exactly four objects with ids A, B, C, and D and concise answer text. "
        f"{source_instruction}"
        f"{focus_instruction}"
        f"{flow_instruction}"
        "Prefer code-centered questions: show a compact Python snippet, loop condition, state update, return line, or one-line mutation when that makes the algorithm idea concrete. "
        "Roughly three out of four drills should include a short code snippet in the question or choices; the rest may be purely conceptual. "
        "Any Python snippets must be fenced as ```python blocks and must follow PEP 8: 4-space indentation, snake_case names, spaces around binary operators, spaces after commas, and no cramped one-letter soup except conventional indexes. "
        "Keep snippets compact: at most 4 short lines in the question, and at most one short line per choice. "
        "Make distractors plausible for adjacent patterns or common code-level mistakes. "
        "Use the requested difficulty for every drill. "
        "Tags must include skill-map, skill-map-mcq, the slug for the algorithm pattern, source mode, and flow mode."
    )
    llm_payload = {
        "questionType": body.questionType,
        "count": body.count,
        "difficulty": difficulty,
        "sourceMode": body.sourceMode,
        "flowMode": body.flowMode,
        "generationSeed": generation_seed,
        "skillMap": [
            {
                "pattern": node.algorithm,
                "methods": node.skills,
                "patternSlug": _pattern_slug(node.algorithm),
            }
            for node in skill_map[: body.count]
        ],
        "specimenContext": body.specimen.model_dump() if body.sourceMode == "card" and body.specimen else None,
        "schema": {
            "drill": {
                "id": "temporary id from model; server will replace it",
                "title": "short pattern-first title",
                "pattern": "algorithm pattern name",
                "skill": "one supplied skill-map method",
                "difficulty": difficulty,
                "question": "one multiple-choice question",
                "choices": [
                    {"id": "A", "text": "choice text"},
                    {"id": "B", "text": "choice text"},
                    {"id": "C", "text": "choice text"},
                    {"id": "D", "text": "choice text"},
                ],
                "correctChoiceId": "A",
                "explanation": "why the answer is correct in one or two sentences",
                "tags": ["skill-map", "skill-map-mcq", "pattern-slug"],
            }
        },
    }

    llm_response: LLMJsonResponse | None = None
    resolved_provider = provider
    resolved_provider_label = provider_label
    for candidate_provider, candidate_label, _available in available_candidates:
        candidate_response: LLMJsonResponse | None = None
        max_attempts = len(retry_delays_seconds) + 1
        for attempt_index in range(max_attempts):
            candidate_response = await asyncio.to_thread(
                call_llm_json,
                system_prompt,
                llm_payload,
                candidate_provider,
                5000,
                provider_timeout_seconds,
                0.7,
            )
            if candidate_response and isinstance(candidate_response.get("drills"), list):
                llm_response = candidate_response
                resolved_provider = candidate_provider
                resolved_provider_label = candidate_label
                break

            if logger is not None:
                logger.warning(
                    "MCQ generation received invalid/empty response from %s (attempt %s/%s).",
                    candidate_label,
                    attempt_index + 1,
                    max_attempts,
                )

            if attempt_index < len(retry_delays_seconds):
                await asyncio.sleep(retry_delays_seconds[attempt_index])

        if llm_response is not None:
            break

        if logger is not None:
            logger.warning("MCQ generation exhausted retries for %s; trying next provider.", candidate_label)

    if not llm_response:
        raise GeneratorUnavailableError(
            code="mcq_generation_no_response",
            message=f"Multiple choice questions cannot be generated at this time. No valid response from {resolved_provider_label}.",
            provider=resolved_provider,
            api_error_code="provider_empty_response",
        )

    drills: list[MultipleChoiceQuestionPayload] = []
    for index, raw in enumerate(llm_response["drills"][: body.count]):
        processed = _process_multiple_choice_card(raw, index, body)
        if not processed:
            raise GeneratorUnavailableError(
                code="mcq_generation_invalid_response",
                message=f"Multiple choice questions cannot be generated at this time. Invalid response from {resolved_provider_label}.",
                provider=resolved_provider,
                api_error_code="provider_invalid_json",
            )
        drills.append(processed)

    if len(drills) != body.count:
        raise GeneratorUnavailableError(
            code="mcq_generation_invalid_response",
            message=f"Multiple choice questions cannot be generated at this time. Invalid response from {resolved_provider_label}.",
            provider=resolved_provider,
            api_error_code="provider_invalid_json",
        )

    if persist_generated_questions is not None:
        try:
            await persist_generated_questions(drills)
        except Exception as error:
            if logger is not None:
                logger.warning("Persisting generated multiple-choice questions failed: %s", error)

    return MultipleChoiceDrillsResponse(drills=drills, llmUsed=True)


def apply_specimen_tuning_to_target(target: str, raw_tuning: Any) -> str:
    tuning = _normalize_specimen_tuning(raw_tuning)
    styled = str(target or "").replace("\r\n", "\n").strip()
    if tuning["typeHints"] == "omit":
        styled = _strip_python_type_hints(styled)
    if tuning["comments"] == "omit":
        styled = _strip_python_comments(styled)
    styled = _apply_variable_name_style(styled, tuning["variableNames"])
    return styled.strip()


def specimen_style_prompt(raw_tuning: Any) -> str:
    tuning = _normalize_specimen_tuning(raw_tuning)
    type_hint_rule = (
        "Use simple Python type hints on function parameters and returns."
        if tuning["typeHints"] == "include"
        else "Do not include Python type hints or return annotations."
    )
    comment_rule = (
        "Use at most two short '#' comments only when they clarify an invariant."
        if tuning["comments"] == "brief"
        else "Do not include '#' comments inside the specimen code."
    )
    variable_rule = {
        "concise": "Use concise conventional pattern names such as l, r, cnt, and best when they aid recall.",
        "descriptive": "Use explicit names such as left, right, value, counts, and best_length; avoid one-letter data variables.",
        "readable": "Use readable interview names: prefer val over x for element values, keep left/right or l/r when conventional, and avoid unclear one-letter data variables.",
    }[tuning["variableNames"]]
    return f"Specimen code style: {type_hint_rule} {comment_rule} {variable_rule}"


def _entry_point_from_template_target(template_mode: str, target: str) -> str:
    lines = str(target or "").replace("\r\n", "\n").split("\n")
    first_line = next((line.strip() for line in lines if line.strip()), "")
    match = re.match(r"def\s+([A-Za-z_]\w*)\s*\(([^)]*)\):", first_line)
    return f"{match.group(1)}({match.group(2)})" if match else ""


def _shorten_annotation_note(value: str, max_words: int = 16) -> str:
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
        if re.search(r"return\s+out\b|return\s+res\b|return\s+result\b", trimmed_line):
            return "return collected result"
        return ""
    if re.match(r"^while\b", trimmed_line):
        if pattern_slug == "sliding-window":
            return "shrink until window is valid"
        if pattern_slug == "binary-search":
            return "keep narrowing the search"
        if pattern_slug in {"dfs-bfs", "graph-traversal"}:
            return "process frontier until empty"
        return ""
    if re.match(r"^(def|for|if|elif|else)\b", trimmed_line):
        return ""
    if pattern_slug == "sliding-window":
        if re.search(r"\b(best|ans)\s*=\s*max\(", trimmed_line):
            return "keep best valid window"
        if re.search(r"\b(left|l)\s*\+=", trimmed_line):
            return "shrink from the left"
        if re.search(r"\b\w+\[[^\]]+\]\s*=\s*\w+\.get\([^)]*\)\s*\+\s*1", trimmed_line) or re.search(r"\b\w+\[[^\]]+\]\s*\+=", trimmed_line):
            return "include entering value"
        if re.search(r"\b\w+\[[^\]]+\]\s*-=", trimmed_line):
            return "remove leaving value"
        if re.match(r"^del\b", trimmed_line):
            return "drop zero count"
        if re.search(r"\.(append|add)\(", trimmed_line) or re.match(r"^(out|res|result)\s*=\s*\[", trimmed_line):
            return "record current window"
        return ""
    if pattern_slug in {"dfs-bfs", "graph-traversal"}:
        if re.search(r"\bvisited\.add\(", trimmed_line) or re.search(r"\bseen\.add\(", trimmed_line):
            return "mark before enqueueing"
        if re.search(r"\b(popleft|pop)\(", trimmed_line):
            return "take next frontier node"
        if re.search(r"\b(q|queue|frontier)\.(append|add|push)\(", trimmed_line):
            return "enqueue unseen neighbor"
        if re.search(r"\.(append|add)\(", trimmed_line):
            return "record reached node"
        return ""
    if pattern_slug == "two-pointers":
        if re.search(r"\bleft\s*\+=", trimmed_line) or re.search(r"\bl\s*\+=", trimmed_line):
            return "move left pointer inward"
        if re.search(r"\bright\s*-=", trimmed_line) or re.search(r"\br\s*-=", trimmed_line):
            return "move right pointer inward"
        if re.search(r"\b(total|cur|area)\s*=", trimmed_line):
            return "measure current pair"
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
    if pattern_slug == "backtracking":
        if re.search(r"\b(record|res|result|out)\.(append|add)\(", trimmed_line):
            return "record completed path"
        if re.search(r"\bpath\.(append|add)\(", trimmed_line):
            return "choose current item"
        if re.search(r"\bpath\.pop\(", trimmed_line):
            return "undo current choice"
        if re.search(r"\b(dfs|backtrack|search)\(", trimmed_line):
            return "explore this branch"
        return ""
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
    if pattern_slug in {"intervals", "prefix-sums", "monotonic-stack", "stack"}:
        if re.search(r"\.(append|add|push)\(", trimmed_line):
            return "record resolved state"
        if re.search(r"\.(pop|remove)\(", trimmed_line):
            return "discard stale candidate"
        return ""
    if re.search(r"\b(union|find)\b", trimmed_line):
        return "merge or locate root"
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


def _is_note_only_inline_decision_line(line: str) -> bool:
    match = re.match(rf"^\s{{{INLINE_NOTE_COLUMN},}}(\S.*)$", line)
    if not match:
        return False
    return _is_inline_decision_line(_append_aligned_note("", match.group(1)))


def _should_place_inline_decision_note_after(line: str, inside_loop: bool, pattern_slug: str) -> bool:
    if not inside_loop:
        return False
    code_part = line.split("#", 1)[0].strip()
    if not code_part:
        return False
    if re.match(r"^(def|for|while|if|elif|else|return)\b", code_part):
        return False
    return bool(_inline_note_for_line(code_part, pattern_slug))


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
        if not inline_decision_inserted and _should_place_inline_decision_note_after(line, inside_loop, pattern_slug):
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
    lines = [
        line
        for line in str(raw_target or "").replace("\r\n", "\n").strip().split("\n")
        if not _is_note_only_inline_decision_line(line)
    ]
    output = [_append_inline_note(line, pattern_slug) for line in lines]
    if any(_is_inline_decision_line(line) for line in output):
        return "\n".join(output).strip()

    inside_loop = False
    inline_decision_index = -1
    for index, line in enumerate(lines):
        if re.match(r"^\s*(for|while)\b", line):
            inside_loop = True
            continue
        if _should_place_inline_decision_note_after(line, inside_loop, pattern_slug):
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


def _strip_inline_annotation_notes(code: str) -> str:
    lines = []
    for line in str(code or "").replace("\r\n", "\n").split("\n"):
        if re.match(rf"^\s{{{INLINE_NOTE_COLUMN},}}\S", line):
            continue
        match = re.match(r"^(.*?\S)(\s{6,})(\S.*)$", line)
        if match:
            lines.append(match.group(1).rstrip())
        else:
            lines.append(line.rstrip())
    return "\n".join(lines).strip()


def _apply_core_shape_tuning_to_target(target: str, raw_tuning: Any) -> str:
    tuning = _normalize_specimen_tuning(raw_tuning)
    styled = str(target or "").replace("\r\n", "\n").strip()
    if tuning["typeHints"] == "omit":
        styled = _strip_python_type_hints(styled)
    styled = _apply_variable_name_style(styled, tuning["variableNames"])
    return styled.strip()


def _extract_nested_helper_target(algorithm_target: str) -> str:
    lines = str(algorithm_target or "").replace("\r\n", "\n").strip().split("\n")
    for start, line in enumerate(lines):
        match = re.match(r"^(\s*)def\s+(dfs|backtrack|search|helper)\s*\(", line)
        if not match or not match.group(1):
            continue
        base_indent = len(match.group(1))
        block = [line]
        for next_line in lines[start + 1 :]:
            stripped = next_line.strip()
            indent = len(next_line) - len(next_line.lstrip())
            if stripped and indent <= base_indent:
                break
            block.append(next_line)
        dedented = [
            block_line[base_indent:] if len(block_line) >= base_indent else block_line.lstrip()
            for block_line in block
        ]
        helper = "\n".join(dedented).strip()
        helper = re.sub(r"\blen\((items|nums|arr|values|candidates|choices|s)\)", "n", helper)
        return helper
    return ""


def _core_shape_template_target(pattern_slug: str, algorithm_target: str) -> str:
    if pattern_slug == "backtracking":
        nested_helper = _extract_nested_helper_target(algorithm_target)
        if nested_helper:
            return _strip_inline_annotation_notes(nested_helper)
    return _strip_inline_annotation_notes(algorithm_target)


def _pattern_prompt_focus(pattern_slug: str, template_mode: str) -> str:
    if template_mode == INLINE_TEMPLATE_KEY:
        return "write a conceptual next-line task for each recall line"

    focus_by_pattern = {
        "sliding-window": {
            TemplateMode.algorithm.value: "code the expand/shrink/update-best loop",
            CORE_SHAPE_TEMPLATE_KEY: "recall the reusable core loop shape",
        },
        "two-pointers": {
            TemplateMode.algorithm.value: "code the inward pointer scan",
            CORE_SHAPE_TEMPLATE_KEY: "recall the pointer movement skeleton",
        },
        "binary-search": {
            TemplateMode.algorithm.value: "code the midpoint discard loop",
            CORE_SHAPE_TEMPLATE_KEY: "recall the boundary discard skeleton",
        },
        "dynamic-programming": {
            TemplateMode.algorithm.value: "code the state-transition loop",
            CORE_SHAPE_TEMPLATE_KEY: "recall the state transition skeleton",
        },
        "dp": {
            TemplateMode.algorithm.value: "code the state-transition loop",
            CORE_SHAPE_TEMPLATE_KEY: "recall the state transition skeleton",
        },
        "graph-traversal": {
            TemplateMode.algorithm.value: "code the frontier plus visited loop",
            CORE_SHAPE_TEMPLATE_KEY: "recall the frontier traversal skeleton",
        },
        "dfs-bfs": {
            TemplateMode.algorithm.value: "code the frontier plus visited loop",
            CORE_SHAPE_TEMPLATE_KEY: "recall the frontier traversal skeleton",
        },
        "backtracking": {
            TemplateMode.algorithm.value: "code the choose/recurse/undo loop",
            CORE_SHAPE_TEMPLATE_KEY: "recall the choose/recurse/undo skeleton",
        },
        "heap": {
            TemplateMode.algorithm.value: "code the push/prune heap loop",
            CORE_SHAPE_TEMPLATE_KEY: "recall the push/prune heap skeleton",
        },
        "union-find": {
            TemplateMode.algorithm.value: "code the find/union component loop",
            CORE_SHAPE_TEMPLATE_KEY: "recall the find/union skeleton",
        },
        "intervals": {
            TemplateMode.algorithm.value: "code the sort-and-merge sweep",
            CORE_SHAPE_TEMPLATE_KEY: "recall the sort-and-merge skeleton",
        },
        "prefix-sums": {
            TemplateMode.algorithm.value: "code the prefix query loop",
            CORE_SHAPE_TEMPLATE_KEY: "recall the prefix lookup skeleton",
        },
        "monotonic-stack": {
            TemplateMode.algorithm.value: "code the pop-then-push stack loop",
            CORE_SHAPE_TEMPLATE_KEY: "recall the pop-then-push skeleton",
        },
        "stack": {
            TemplateMode.algorithm.value: "code the pop-then-push stack loop",
            CORE_SHAPE_TEMPLATE_KEY: "recall the pop-then-push skeleton",
        },
    }
    default_focus = {
        TemplateMode.algorithm.value: "code the reusable pattern loop",
        CORE_SHAPE_TEMPLATE_KEY: "recall the reusable core shape",
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


def _extract_function_signature(target: str) -> tuple[str, str, str]:
    first_line = next((line.strip() for line in str(target or "").splitlines() if line.strip()), "")
    match = re.match(r"def\s+([A-Za-z_]\w*)\s*\(([^)]*)\):", first_line)
    if not match:
        return "solve", "", "solve()"
    name = match.group(1)
    params = match.group(2).strip()
    return name, params, f"{name}({params})"


def _sample_value_for_param(param: str) -> str:
    name = param.split("=", 1)[0].replace("*", "").strip().lower()
    if not name:
        return "value"
    if name in {"s", "text", "expr", "expression"} or "string" in name:
        return '"abc"'
    if "graph" in name or name in {"adj"}:
        return '{"A": ["B"], "B": []}'
    if "interval" in name:
        return "[[1, 3], [2, 6]]"
    if name in {"target", "limit"}:
        return "5"
    if name == "k":
        return "2"
    if name == "n":
        return "3"
    if any(token in name for token in ("num", "arr", "item", "value")):
        return "[1, 2, 3]"
    return "..."


def _input_example_from_signature(target: str) -> str:
    name, params, _signature = _extract_function_signature(target)
    param_names = [
        param.split(":", 1)[0].split("=", 1)[0].strip()
        for param in params.split(",")
        if param.strip()
    ]
    if not param_names:
        return f"{name}()"
    assignments = [f"{param} = {_sample_value_for_param(param)}" for param in param_names]
    return f"{chr(10).join(assignments)}\n\n{name}({', '.join(param_names)})"


def build_plain_english_prompt_detail(
    *,
    pattern: str,
    pattern_slug: str,
    method: str,
    title: str,
    prompt: str,
    target: str,
    hint: str = "",
) -> LLMJsonPayload:
    profile = _focused_profile(pattern or pattern_slug, method)
    if profile:
        return {
            "plainEnglish": str(profile.get("plainEnglish", "")),
            "interviewQuestion": str(profile.get("interviewQuestion", "")),
            "inputExample": str(profile.get("inputExample", "")),
            "outputExample": str(profile.get("outputExample", "")),
            "explanation": str(profile.get("explanation", "")),
            "brassTacks": str(profile.get("brassTacks", "")),
            "leetcodeExamples": [str(example) for example in profile.get("leetcodeExamples", [])],
        }
    pattern_label = _display_label(pattern or pattern_slug or "pattern")
    family_slug = _pattern_family_slug(pattern_slug)
    method_label = _display_label(method or "core move").lower()
    _name, _params, signature = _extract_function_signature(target)
    brass_tacks = hint or f"Recall the {method_label} shape without changing the pattern."
    return {
        "plainEnglish": f"What is the {method_label} move?",
        "interviewQuestion": f"Recall {signature}: use {pattern_label} for {method_label}.",
        "inputExample": _input_example_from_signature(target),
        "outputExample": "returns the value produced by the skeleton",
        "explanation": f"{title} practices one reusable move: {prompt.rstrip('.')}.",
        "brassTacks": _limit_words(brass_tacks, 14),
        "leetcodeExamples": _pattern_examples(family_slug)[:3],
    }


def _template_prompt_from_target(pattern: str, pattern_slug: str, template_mode: str, target: str) -> str:
    pattern_label = re.sub(r"\s+", " ", str(pattern or "").strip()) or "Algorithm"
    pattern_label = pattern_label[0].upper() + pattern_label[1:] if pattern_label else "Algorithm"
    family_slug = _pattern_family_slug(pattern_slug)
    spirit = _pattern_prompt_spirit(family_slug)
    focus = _pattern_prompt_focus(family_slug, template_mode)
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
    family_slug = _pattern_family_slug(pattern_slug)
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
        targets.setdefault(CORE_SHAPE_TEMPLATE_KEY, _core_shape_template_target(family_slug, algorithm_target))
        targets.setdefault(INLINE_TEMPLATE_KEY, _inline_template_target(family_slug, algorithm_target))
    for mode, target in list(targets.items()):
        if mode == CORE_SHAPE_TEMPLATE_KEY:
            targets[mode] = _apply_core_shape_tuning_to_target(target, body.specimenTuning)
        else:
            targets[mode] = apply_specimen_tuning_to_target(target, body.specimenTuning)
    if targets.get(INLINE_TEMPLATE_KEY):
        targets[INLINE_TEMPLATE_KEY] = _normalize_inline_template_target(family_slug, targets[INLINE_TEMPLATE_KEY])
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


def attach_plain_english_prompt_detail(
    drill: SkillMapDrillPayload,
    *,
    pattern: str = "",
    method: str = "",
) -> SkillMapDrillPayload:
    tags = [str(tag) for tag in drill.get("tags", []) if str(tag).strip()]
    pattern_slug = _pattern_slug(pattern) or next((tag for tag in tags if tag != "skill-map"), "")
    template_targets = drill.get("templateTargets", {}) if isinstance(drill.get("templateTargets"), dict) else {}
    target = str(
        template_targets.get(TemplateMode.algorithm.value)
        or str(drill.get("solution", "")).replace("{{missing}}", str(drill.get("missing", "")))
    )
    prompt = str(drill.get("prompt", "")).strip()
    title = str(drill.get("title", "")).strip()
    detail = drill.get("plainEnglishPromptDetail")
    if isinstance(detail, dict) and all(str(detail.get(key, "")).strip() for key in ("plainEnglish", "interviewQuestion")):
        return drill
    return {
        **drill,
        "plainEnglishPromptDetail": build_plain_english_prompt_detail(
            pattern=pattern or pattern_slug,
            pattern_slug=pattern_slug,
            method=method,
            title=title,
            prompt=prompt,
            target=target,
            hint=str(drill.get("hint", "")),
        ),
    }


def _focused_source_method(source_node: Any) -> str:
    skills = list(getattr(source_node, "skills", []) or []) if source_node else []
    return str(skills[0]).strip() if skills else "core method"


def _should_rewrite_focused_drill(raw: SkillMapDrillPayload, pattern: str, method: str, target: str) -> bool:
    title = str(raw.get("title", ""))
    prompt = str(raw.get("prompt", ""))
    hint = str(raw.get("hint", ""))
    combined = " ".join([title, prompt, hint])
    if not _text_anchors_method(combined, pattern, method):
        return True
    if _word_count(prompt) > 8:
        return True
    if _word_count(hint) > 12:
        return True
    if not target.strip() or _target_looks_story_like(target):
        return True
    if not _target_matches_focused_method(target, pattern, method):
        return True
    return _target_line_count(target) > 8


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
            INLINE_TEMPLATE_KEY: _limit_words(f"{pattern}: add notes", 8),
        },
        "templateTargets": {
            TemplateMode.algorithm.value: target,
            CORE_SHAPE_TEMPLATE_KEY: _apply_core_shape_tuning_to_target(
                _core_shape_template_target(_pattern_family_slug(pattern_slug), target),
                body.specimenTuning,
            ),
            INLINE_TEMPLATE_KEY: _normalize_inline_template_target(
                _pattern_family_slug(pattern_slug),
                _inline_template_target(_pattern_family_slug(pattern_slug), target),
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


def _call_openai_streaming(
    system_prompt: str,
    user_payload: LLMJsonPayload,
    max_tokens: int = 1800,
    timeout_seconds: int = 90,
    temperature: float = 0.7,
) -> Generator[str, None, None]:
    if not settings.coach_openai_api_key:
        return
    url = f"{settings.coach_openai_base_url.rstrip('/')}/chat/completions"
    body: LLMJsonPayload = {
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
    pattern_slug = _pattern_slug(pattern)
    method = _focused_source_method(source_node)
    question_title = str(getattr(source_node, "questionTitle", "") or "").strip() if source_node else ""
    playlist_slug = str(getattr(source_node, "playlistSlug", "") or "").strip() if source_node else ""
    if pattern_slug and pattern_slug not in tags:
        tags.append(pattern_slug)
    if _is_focused_request(body):
        method_slug = _method_slug(method)
        family_slug = _pattern_family_slug(pattern_slug)
        if family_slug and family_slug not in tags:
            tags.append(family_slug)
        if method_slug and method_slug not in tags:
            tags.append(method_slug)
    if playlist_slug and playlist_slug not in tags:
        tags.append(playlist_slug)
    if question_title:
        title_slug = _question_slug(question_title)
        if title_slug not in tags:
            tags.append(title_slug)
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
    if _is_focused_request(body):
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
                    INLINE_TEMPLATE_KEY: _limit_words(f"{pattern}: add notes", 8),
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
        template_prompts.get(_template_mode_value(body.templateMode))
        or _clean_concise_prompt(str(raw.get("prompt", "")).strip(), prompt_max_chars)
        or _template_prompt_from_target(
            pattern,
            pattern_slug,
            _template_mode_value(body.templateMode),
            solution.replace("{{missing}}", missing),
        )
    )
    return attach_plain_english_prompt_detail(
        {
            "id": str(raw.get("id", f"skill-map-{index + 1}")),
            "title": question_title or str(raw.get("title", f"Skill Map Card {index + 1}")),
            "difficulty": _normalize_drill_difficulty(raw.get("difficulty", "Med.")),
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
    playlist_request = _is_playlist_request(body)
    focused_request = _is_focused_request(body)
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
        "templateMode": _template_mode_value(body.templateMode),
        "templateTargets": body.templateTargets,
        "specimenTuning": _normalize_specimen_tuning(body.specimenTuning),
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


def _invalid_response_error(context: GeneratorContext) -> GeneratorUnavailableError:
    return GeneratorUnavailableError(
        code="coach_llm_invalid_response",
            message=f"Skill-map practice cards cannot be generated at this time. Invalid response from {context.provider_label}.",
        provider=context.provider,
        api_error_code="provider_invalid_json",
    )


def _fallback_template_for_pattern(pattern: str, method_hint: str, prompt_max_chars: int = 80) -> SkillMapDrillPayload:
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
        if _is_focused_request(context.body):
            drills.append(
                attach_plain_english_prompt_detail(
                    _focused_drill_from_source(
                        raw=None,
                        index=index,
                        body=context.body,
                        source_node=node,
                        pattern=pattern,
                        pattern_slug=_pattern_slug(pattern),
                        method=method_hint,
                    ),
                    pattern=pattern,
                    method=method_hint,
                )
            )
            continue
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
                    *([_question_slug(question_title)] if question_title else []),
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
        raise GeneratorUnavailableError(
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
            except GeneratorUnavailableError:
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
