from __future__ import annotations

async def get_skill_map():
    from app.services import attempts_service

    return await attempts_service.get_skill_map()


async def get_skill_map_overview():
    from app.services import attempts_service

    return await attempts_service.get_skill_map_overview()
