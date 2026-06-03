from __future__ import annotations


async def random_core_algorithm_drills(count: int):
    from app.core import core_algorithm_practice as core_algorithm_practice_core

    return await core_algorithm_practice_core.random_core_algorithm_drills(count)


async def core_algorithm_drills_for_tag(tag: str, count: int):
    from app.core import core_algorithm_practice as core_algorithm_practice_core

    return await core_algorithm_practice_core.core_algorithm_drills_for_tag(tag, count)


async def core_algorithm_drills_for_pattern(pattern_slug: str):
    from app.core import core_algorithm_practice as core_algorithm_practice_core

    return await core_algorithm_practice_core.core_algorithm_drills_for_pattern(pattern_slug)
