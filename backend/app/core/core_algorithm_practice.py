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
    slug = str(row["slug"])
    code = str(row["code"]).strip()
    algorithm_slug = str(row["algorithm_slug"])
    algorithm_name = str(row["algorithm_name"])
    technique_slugs = [str(item) for item in (row.get("technique_slugs") or []) if str(item).strip()]
    tags = [str(tag) for tag in (row.get("tags") or []) if str(tag).strip()]
    is_meta = "core-meta" in tags or algorithm_slug == "meta"
    if "skill-map" not in tags:
        tags.insert(0, "skill-map")
    if not is_meta and "core-algorithm" not in tags:
        tags.insert(1, "core-algorithm")
    if algorithm_slug not in tags:
        tags.append(algorithm_slug)
    for technique_slug in technique_slugs:
        if technique_slug not in tags:
            tags.append(technique_slug)
    description = str(row.get("description") or "").strip()
    title = str(row["title"])
    prompt_subject = "Meta question" if "core-meta" in tags else "core algorithm"
    prompt = f"{algorithm_name}: memorize the {prompt_subject}."
    entry_name = _entry_point_name(code) or slug
    examples = _examples(row.get("leetcode_examples"))
    return {
        "id": f"core-algorithm-{slug}",
        "title": title,
        "difficulty": str(row["difficulty"]),
        "prompt": prompt,
        "templatePrompts": {
            "algorithm": prompt,
            "coreShape": prompt,
            "inline": f"{algorithm_name}: follow progressive conceptual line tasks.",
        },
        "templateTargets": {
            "algorithm": code,
            "coreShape": code,
            "inline": code,
        },
        "solution": code,
        "missing": "# core algorithm complete",
        "hint": description or f"Recall the reusable {algorithm_name} function shape.",
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


async def problem_drills_for_algorithm(algorithm_slug: str) -> dict[str, Any]:
    from app.services import problem_practice_service

    return await problem_practice_service.problem_drills_for_algorithm(algorithm_slug)


async def problem_drills_for_tag(tag_slug: str, count: int = 10) -> dict[str, Any]:
    from app.services import problem_practice_service

    return await problem_practice_service.problem_drills_for_tag(tag_slug, count)


async def random_problem_drills(count: int = 10) -> dict[str, Any]:
    from app.services import problem_practice_service

    return await problem_practice_service.random_problem_drills(count)
