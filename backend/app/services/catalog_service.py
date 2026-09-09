from __future__ import annotations

import json
from typing import Any

from app.repositories.unified_catalog_repository import fetch_playlist_catalog_rows


def _json_object(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


async def get_playlist_catalog() -> dict[str, list[dict[str, Any]]]:
    playlists: dict[str, dict[str, Any]] = {}
    for row in await fetch_playlist_catalog_rows():
        slug = str(row["slug"])
        playlist = playlists.setdefault(
            slug,
            {
                "slug": slug,
                "title": str(row["title"]),
                "description": str(row["description"] or ""),
                "showOnSkillMap": bool(row["show_on_skill_map"]),
                "staticDeck": bool(row["static_deck"]),
                "questions": [],
            },
        )
        metadata = _json_object(row["playlist_metadata"])
        playlist["questions"].append({
            "title": str(row["item_title"]),
            "coreShape": str(metadata.get("coreShape") or ""),
            "methods": [str(method) for method in metadata.get("methods", [])],
        })
    return {"playlists": list(playlists.values())}