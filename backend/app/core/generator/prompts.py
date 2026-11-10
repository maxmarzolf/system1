"""Card prompts, plain-English prompt detail and template prompt maps."""

from __future__ import annotations

import re
from typing import Any

from app.core.focused_core_algorithm_cards import (
    focused_profile as _focused_profile,
    pattern_examples as _pattern_examples,
    pattern_family_slug as _pattern_family_slug,
)
from app.contracts.coaching import SkillMapDrillsRequest, TemplateMode
from app.core.taxonomy import slugify
from app.core.generator.types import (
    CORE_SHAPE_TEMPLATE_KEY,
    INLINE_TEMPLATE_KEY,
    LLMJsonPayload,
    SkillMapDrillPayload,
    TEMPLATE_TARGET_ORDER,
)
from app.core.generator.text import clean_concise_prompt, display_label, limit_words
from app.core.generator.code_style import apply_specimen_tuning_to_target
from app.core.generator.inline_notes import (
    apply_core_shape_tuning_to_target,
    core_shape_template_target,
    entry_point_from_template_target,
    inline_template_target,
    normalize_inline_template_target,
)


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
    pattern_label = display_label(pattern or pattern_slug or "pattern")
    family_slug = _pattern_family_slug(pattern_slug)
    method_label = display_label(method or "core move").lower()
    _name, _params, signature = _extract_function_signature(target)
    brass_tacks = hint or f"Recall the {method_label} shape without changing the pattern."
    return {
        "plainEnglish": f"What is the {method_label} move?",
        "interviewQuestion": f"Recall {signature}: use {pattern_label} for {method_label}.",
        "inputExample": _input_example_from_signature(target),
        "outputExample": "returns the value produced by the skeleton",
        "explanation": f"{title} practices one reusable move: {prompt.rstrip('.')}.",
        "brassTacks": limit_words(brass_tacks, 14),
        "leetcodeExamples": _pattern_examples(family_slug)[:3],
    }


def template_prompt_from_target(pattern: str, pattern_slug: str, template_mode: str, target: str) -> str:
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
        for token in re.sub(r"[^a-z0-9_+\-\s]", " ", entry_point_from_template_target(TemplateMode.algorithm.value, target).lower()).split()
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


def template_targets_for_drill(
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
        targets.setdefault(CORE_SHAPE_TEMPLATE_KEY, core_shape_template_target(family_slug, algorithm_target))
        targets.setdefault(INLINE_TEMPLATE_KEY, inline_template_target(family_slug, algorithm_target))
    for mode, target in list(targets.items()):
        if mode == CORE_SHAPE_TEMPLATE_KEY:
            targets[mode] = apply_core_shape_tuning_to_target(target, body.specimenTuning)
        else:
            targets[mode] = apply_specimen_tuning_to_target(target, body.specimenTuning)
    if targets.get(INLINE_TEMPLATE_KEY):
        targets[INLINE_TEMPLATE_KEY] = normalize_inline_template_target(family_slug, targets[INLINE_TEMPLATE_KEY])
    return targets


def template_prompt_map(
    body: SkillMapDrillsRequest,
    pattern: str,
    pattern_slug: str,
    solution: str,
    missing: str,
    raw_template_prompts: Any = None,
    template_targets: dict[str, str] | None = None,
    prompt_max_chars: int = 80,
) -> dict[str, str]:
    targets = template_targets or template_targets_for_drill(body, pattern_slug, solution, missing)
    raw_prompts = raw_template_prompts if isinstance(raw_template_prompts, dict) else {}
    prompts: dict[str, str] = {}

    for mode in TEMPLATE_TARGET_ORDER:
        raw_prompt = clean_concise_prompt(str(raw_prompts.get(mode, "")).strip(), prompt_max_chars)
        target = targets.get(mode, "")
        if raw_prompt and not _prompt_is_generic(raw_prompt, pattern_slug, mode, target):
            prompts[mode] = raw_prompt
            continue
        if target:
            prompts[mode] = template_prompt_from_target(pattern, pattern_slug, mode, target)
            continue
        if raw_prompt:
            prompts[mode] = raw_prompt

    return prompts


def normalize_drill_difficulty(value: Any) -> str:
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
    pattern_slug = slugify(pattern) or next((tag for tag in tags if tag != "skill-map"), "")
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
