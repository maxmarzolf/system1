from __future__ import annotations

import json
import re
from typing import Any


def _examples(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value]
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return []
        return [str(item) for item in parsed] if isinstance(parsed, list) else []
    return []


def _entry_point_name(code: str) -> str:
    match = re.search(r"^(?:def|class)\s+([A-Za-z_][A-Za-z0-9_]*)\b", code, re.MULTILINE)
    return match.group(1) if match else ""


def build_core_algorithm_drill(row: dict[str, Any]) -> dict[str, Any]:
    name = str(row["name"])
    code = str(row["code"]).strip()
    pattern_slug = str(row["pattern_slug"])
    pattern_name = str(row["pattern_name"])
    tags = [str(tag) for tag in (row.get("tags") or []) if str(tag).strip()]
    is_meta = "core-meta" in tags or pattern_slug == "meta"
    if "skill-map" not in tags:
        tags.insert(0, "skill-map")
    if not is_meta and "core-algorithm" not in tags:
        tags.insert(1, "core-algorithm")
    if pattern_slug not in tags:
        tags.append(pattern_slug)
    description = str(row.get("description") or "").strip()
    title = str(row["title"])
    prompt_subject = "Meta question" if "core-meta" in tags else "core algorithm"
    prompt = f"{pattern_name}: memorize the {prompt_subject}."
    entry_name = _entry_point_name(code) or name
    examples = _examples(row.get("leetcode_examples"))
    return {
        "id": f"core-algorithm-{name}",
        "title": title,
        "difficulty": str(row["difficulty"]),
        "prompt": prompt,
        "templatePrompts": {
            "algorithm": prompt,
            "coreShape": prompt,
            "inline": f"{pattern_name}: add line notes.",
        },
        "templateTargets": {
            "algorithm": code,
            "coreShape": code,
            "inline": code,
        },
        "solution": code,
        "missing": "# core algorithm complete",
        "hint": description or f"Recall the reusable {pattern_name} function shape.",
        "tags": tags,
        "plainEnglishPromptDetail": {
            "plainEnglish": f"What is the reusable move in {entry_name}?",
            "interviewQuestion": description or f"Recreate the {title} core algorithm.",
            "inputExample": f"{entry_name}(...)",
            "outputExample": "the function's return value",
            "explanation": description,
            "brassTacks": f"Memorize the state, loop, update, and return path for {entry_name}.",
            "leetcodeExamples": examples,
        },
    }


async def core_algorithm_drills_for_pattern(pattern_slug: str) -> dict[str, Any]:
    from app.repositories.core_algorithms_repository import fetch_core_algorithm_practice_rows

    rows = await fetch_core_algorithm_practice_rows(pattern_slug)
    return {
        "drills": [build_core_algorithm_drill(row) for row in rows],
        "llmUsed": False,
    }


async def core_algorithm_drills_for_tag(tag_slug: str, count: int = 10) -> dict[str, Any]:
    from app.repositories.core_algorithms_repository import fetch_core_algorithm_practice_rows_by_tag

    safe_count = max(1, min(int(count or 10), 30))
    rows = await fetch_core_algorithm_practice_rows_by_tag(tag_slug, safe_count)
    return {
        "drills": [build_core_algorithm_drill(row) for row in rows],
        "llmUsed": False,
    }


async def random_core_algorithm_drills(count: int = 10) -> dict[str, Any]:
    from app.repositories.core_algorithms_repository import fetch_random_core_algorithm_practice_rows

    safe_count = max(1, min(int(count or 10), 30))
    rows = await fetch_random_core_algorithm_practice_rows(safe_count)
    return {
        "drills": [build_core_algorithm_drill(row) for row in rows],
        "llmUsed": False,
    }
