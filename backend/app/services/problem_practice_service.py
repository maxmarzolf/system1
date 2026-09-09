from __future__ import annotations

import json

from app.core.core_algorithm_practice import build_core_algorithm_drill
from app.core.static_playlists import build_static_playlist_drills
from app.repositories.problems_repository import (
    fetch_problem_practice_rows,
    fetch_problem_practice_rows_by_tag,
    fetch_problem_practice_rows_by_technique,
    fetch_random_problem_practice_rows,
)
from app.repositories.unified_catalog_repository import fetch_static_playlist_drills


def _json_object(value):
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


async def random_problem_drills(count: int):
    safe_count = max(1, min(int(count or 10), 30))
    rows = await fetch_random_problem_practice_rows(safe_count)
    return {
        "drills": [build_core_algorithm_drill(row) for row in rows],
        "llmUsed": False,
    }

async def problem_drills_for_tag(tag: str, count: int):
    safe_count = max(1, min(int(count or 10), 30))
    rows = await fetch_problem_practice_rows_by_tag(tag, safe_count)
    return {
        "drills": [build_core_algorithm_drill(row) for row in rows],
        "llmUsed": False,
    }

async def problem_drills_for_algorithm(algorithm_slug: str):
    rows = await fetch_problem_practice_rows(algorithm_slug)
    return {
        "drills": [build_core_algorithm_drill(row) for row in rows],
        "llmUsed": False,
    }

async def problem_drills_for_technique(technique_slug: str):
    rows = await fetch_problem_practice_rows_by_technique(technique_slug)
    return {
        "drills": [build_core_algorithm_drill(row) for row in rows],
        "llmUsed": False,
    }

async def static_playlist_drills(playlist_slug: str, order: str = "curated"):
    try:
        rows = await fetch_static_playlist_drills(playlist_slug, order)
    except AssertionError:
        rows = []
    if rows:
        drills = []
        for row in rows:
            metadata = _json_object(row.get("metadata"))
            playlist_metadata = _json_object(row.get("playlist_metadata"))
            drill = {
                "id": row["id"],
                "questionType": row["question_type"],
                "title": row["title"],
                "difficulty": row["difficulty"],
                "prompt": row["prompt"],
                "solution": row["solution"],
                "missing": row["missing"],
                "hint": row["hint"],
                "tags": list(row["tags"] or []),
                **metadata,
            }
            skeleton_applicability = playlist_metadata.get("skeletonApplicability")
            if skeleton_applicability:
                drill["skeletonApplicability"] = skeleton_applicability
            drills.append(drill)
        return {"drills": drills, "llmUsed": False}

    return build_static_playlist_drills(playlist_slug, order) or {
        "drills": [],
        "llmUsed": False,
    }
