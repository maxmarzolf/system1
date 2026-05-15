from __future__ import annotations

import json
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


def build_static_function_drill(row: dict[str, Any]) -> dict[str, Any]:
    name = str(row["name"])
    code = str(row["code"]).strip()
    pattern_slug = str(row["pattern_slug"])
    pattern_name = str(row["pattern_name"])
    tags = [str(tag) for tag in (row.get("tags") or []) if str(tag).strip()]
    if "skill-map" not in tags:
        tags.insert(0, "skill-map")
    if "static-function" not in tags:
        tags.insert(1, "static-function")
    if pattern_slug not in tags:
        tags.append(pattern_slug)
    description = str(row.get("description") or "").strip()
    title = str(row["title"])
    prompt = f"{pattern_name}: memorize {name}."
    examples = _examples(row.get("leetcode_examples"))
    return {
        "id": f"static-function-{name}",
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
        "missing": "# static function complete",
        "hint": description or f"Recall the reusable {pattern_name} function shape.",
        "tags": tags,
        "plainEnglishPromptDetail": {
            "plainEnglish": f"What is the reusable move in {name}?",
            "interviewQuestion": description or f"Recreate the {title} static function.",
            "inputExample": f"{name}(...)",
            "outputExample": "the function's return value",
            "explanation": description,
            "brassTacks": f"Memorize the state, loop, update, and return path for {name}.",
            "leetcodeExamples": examples,
        },
    }


async def static_function_drills_for_pattern(pattern_slug: str) -> dict[str, Any]:
    from app.repositories.static_functions_repository import fetch_static_function_practice_rows

    rows = await fetch_static_function_practice_rows(pattern_slug)
    return {
        "drills": [build_static_function_drill(row) for row in rows],
        "llmUsed": False,
    }


async def random_static_function_drills(count: int = 10) -> dict[str, Any]:
    from app.repositories.static_functions_repository import fetch_random_static_function_practice_rows

    safe_count = max(1, min(int(count or 10), 30))
    rows = await fetch_random_static_function_practice_rows(safe_count)
    return {
        "drills": [build_static_function_drill(row) for row in rows],
        "llmUsed": False,
    }
