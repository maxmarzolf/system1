"""Small text helpers: prompt trimming, word limits and request classification."""

from __future__ import annotations

import re

from app.core.focused_core_algorithm_cards import focused_target_terms as _focused_target_terms
from app.models import SkillMapDrillsRequest, TemplateMode
from app.core.taxonomy import slugify
from app.core.generator.types import TEMPLATE_MODE_ORDER


def question_slug(title: str) -> str:
    return slugify(title)[:72] or "question"


def is_playlist_request(body: SkillMapDrillsRequest) -> bool:
    return str(body.questionType or "").startswith("playlist:")


def is_focused_request(body: SkillMapDrillsRequest) -> bool:
    return str(body.questionType or "").strip() == "skill-map-targeted"


def template_mode_value(value: TemplateMode | str | None) -> str:
    if isinstance(value, TemplateMode):
        return value.value
    normalized = str(value or "").strip().lower()
    return normalized if normalized in TEMPLATE_MODE_ORDER else TemplateMode.algorithm.value


def clean_concise_prompt(value: str, max_chars: int = 80) -> str:
    prompt = re.sub(r"\s+", " ", str(value or "").strip())
    if len(prompt) <= max_chars:
        return prompt
    shortened = prompt[:max_chars].rsplit(" ", 1)[0].strip()
    return f"{shortened}..."


def display_label(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", str(value or "").replace("-", " ").replace("_", " ")).strip()
    return cleaned[:1].upper() + cleaned[1:] if cleaned else ""


def word_count(value: str) -> int:
    return len(re.findall(r"[A-Za-z0-9]+(?:[-/][A-Za-z0-9]+)?", str(value or "")))


def limit_words(value: str, max_words: int) -> str:
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


def text_anchors_method(value: str, pattern: str, method: str) -> bool:
    normalized = re.sub(r"[^a-z0-9+\-\s]", " ", str(value or "").lower().replace("/", " "))
    tokens = {token for token in normalized.split() if len(token) >= 3}
    method_tokens = _method_tokens(method)
    pattern_tokens = _method_tokens(pattern)
    if method_tokens and tokens & method_tokens:
        return True
    return bool(pattern_tokens and tokens & pattern_tokens and not method_tokens)


def target_line_count(target: str) -> int:
    return len([line for line in str(target or "").splitlines() if line.strip()])


def target_looks_story_like(target: str) -> bool:
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


def target_matches_focused_method(target: str, pattern: str, method: str) -> bool:
    expected_terms = _focused_target_terms(pattern, method)
    if not expected_terms:
        return True
    lowered = str(target or "").lower()
    return any(term.lower() in lowered for term in expected_terms)
