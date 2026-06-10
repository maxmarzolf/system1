from __future__ import annotations

from app.core.core_algorithm_practice import build_core_algorithm_drill
from app.repositories.core_algorithms_repository import (
    fetch_core_algorithm_practice_rows,
    fetch_core_algorithm_practice_rows_by_tag,
    fetch_random_core_algorithm_practice_rows,
)


async def random_core_algorithm_drills(count: int):
    safe_count = max(1, min(int(count or 10), 30))
    rows = await fetch_random_core_algorithm_practice_rows(safe_count)
    return {
        "drills": [build_core_algorithm_drill(row) for row in rows],
        "llmUsed": False,
    }

async def core_algorithm_drills_for_tag(tag: str, count: int):
    safe_count = max(1, min(int(count or 10), 30))
    rows = await fetch_core_algorithm_practice_rows_by_tag(tag, safe_count)
    return {
        "drills": [build_core_algorithm_drill(row) for row in rows],
        "llmUsed": False,
    }

async def core_algorithm_drills_for_pattern(pattern_slug: str):
    rows = await fetch_core_algorithm_practice_rows(pattern_slug)
    return {
        "drills": [build_core_algorithm_drill(row) for row in rows],
        "llmUsed": False,
    }
