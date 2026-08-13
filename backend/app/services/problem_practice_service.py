from __future__ import annotations

from app.core.core_algorithm_practice import build_core_algorithm_drill
from app.core.static_playlists import build_static_playlist_drills
from app.repositories.problems_repository import (
    fetch_problem_practice_rows,
    fetch_problem_practice_rows_by_tag,
    fetch_problem_practice_rows_by_technique,
    fetch_random_problem_practice_rows,
)


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
    return build_static_playlist_drills(playlist_slug, order) or {
        "drills": [],
        "llmUsed": False,
    }
