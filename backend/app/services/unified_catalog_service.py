from __future__ import annotations

from typing import Any

from app.core.static_playlists import (
    STATIC_PLAYLISTS,
    build_static_playlist_drills,
    static_playlist_orders,
)
from app.repositories.unified_catalog_repository import (
    seed_static_playlist,
)


_STATIC_PLAYLIST_DESCRIPTIONS = {
    "google": "Google-focused LeetCode playlist organized by tier and algorithm family.",
    "skeletons": "Static skeleton drills for reusable search, traversal, graph, data structure, and optimization patterns.",
}


def _playlist_item(drill: dict[str, Any], question: dict[str, Any] | None = None) -> dict[str, Any]:
    plain_english = drill.get("plainEnglishPromptDetail") or {}
    tags = [str(tag) for tag in drill.get("tags", []) if str(tag).strip()]
    tier = next((tag for tag in tags if tag.startswith("tier-")), None)
    family = next(
        (
            tag
            for tag in tags
            if tag not in {"skill-map", "static-playlist", "google", "skeletons", "google-skeletons"}
            and not tag.startswith("tier-")
        ),
        None,
    )
    metadata = {
        "templatePrompts": drill.get("templatePrompts", {}),
        "templateTargets": drill.get("templateTargets", {}),
        "plainEnglishPromptDetail": plain_english,
        "skeletonApplicability": drill.get("skeletonApplicability"),
        "coreShape": (question or {}).get("coreShape"),
        "methods": list((question or {}).get("methods", [])),
    }
    return {
        "id": str(drill["id"]),
        "questionType": "playlist:static",
        "title": str(drill["title"]),
        "difficulty": str(drill["difficulty"]),
        "prompt": str(drill["prompt"]),
        "solution": str(drill["solution"]),
        "missing": str(drill["missing"]),
        "hint": str(drill["hint"]),
        "tags": tags,
        "metadata": metadata,
        "playlistMetadata": {
            "tier": tier,
            "family": family,
            "skeletonApplicability": drill.get("skeletonApplicability"),
        },
        "tier": tier,
        "family": family,
    }


def _ordered_ids(playlist_slug: str, order_slug: str) -> list[str]:
    payload = build_static_playlist_drills(playlist_slug, order_slug) or {"drills": []}
    return [str(drill["id"]) for drill in payload["drills"]]


async def seed_canonical_catalog() -> None:

    for playlist_slug, playlist in STATIC_PLAYLISTS.items():
        curated = build_static_playlist_drills(playlist_slug, "curated") or {"drills": []}
        questions_by_title = {
            str(question["title"]): question
            for question in playlist["questions"]
        }
        items = [
            _playlist_item(drill, questions_by_title.get(str(drill["title"])))
            for drill in curated["drills"]
        ]
        orderings = {
            order_slug: _ordered_ids(playlist_slug, order_slug)
            for order_slug in static_playlist_orders(playlist_slug)
        }
        await seed_static_playlist(
            slug=playlist_slug,
            title=str(playlist["title"]),
            description=_STATIC_PLAYLIST_DESCRIPTIONS.get(playlist_slug, ""),
            show_on_skill_map=True,
            items=items,
            orderings=orderings,
        )
