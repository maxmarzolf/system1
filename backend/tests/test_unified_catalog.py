from __future__ import annotations

import asyncio

from app.core.static_playlists import STATIC_PLAYLISTS, build_static_playlist_drills, static_playlist_orders
from app.services import problem_practice_service
from app.services.unified_catalog_service import _ordered_ids, _playlist_item


def test_static_playlist_seed_covers_every_declared_order() -> None:
    for playlist_slug in STATIC_PLAYLISTS:
        curated = build_static_playlist_drills(playlist_slug, "curated")
        assert curated is not None
        expected_ids = [str(drill["id"]) for drill in curated["drills"]]

        for order_slug in static_playlist_orders(playlist_slug):
            ordered_ids = _ordered_ids(playlist_slug, order_slug)
            if playlist_slug == "google" and order_slug == "google-15":
                assert len(ordered_ids) == 15
                assert set(ordered_ids).issubset(set(expected_ids))
            else:
                assert len(ordered_ids) == len(expected_ids)
                assert set(ordered_ids) == set(expected_ids)


def test_static_playlist_seed_preserves_skeleton_metadata() -> None:
    payload = build_static_playlist_drills("skeletons", "curated")
    assert payload is not None

    skeleton = next(drill for drill in payload["drills"] if drill["title"] == "BFS Skeleton")
    item = _playlist_item(skeleton)

    assert item["id"] == "playlist-skeletons-bfs-skeleton"
    assert item["metadata"]["skeletonApplicability"]["templateStrength"] == 10
    assert item["playlistMetadata"]["skeletonApplicability"]["timeComplexity"] == "O(V + E)"


def test_static_playlist_seed_preserves_solution_and_prompt_targets() -> None:
    payload = build_static_playlist_drills("google", "curated")
    assert payload is not None

    two_sum = next(drill for drill in payload["drills"] if drill["title"] == "1. Two Sum")
    item = _playlist_item(two_sum)

    assert "def solution" in item["solution"]
    assert item["metadata"]["templateTargets"]["algorithm"] == two_sum["solution"]
    assert item["metadata"]["plainEnglishPromptDetail"]["leetcodeExamples"] == ["1. Two Sum"]


def test_playlist_service_falls_back_when_catalog_database_is_unavailable(monkeypatch) -> None:
    async def _unavailable(_playlist_slug, _order_slug):
        raise AssertionError("Database pool not initialised")

    monkeypatch.setattr(problem_practice_service, "fetch_static_playlist_drills", _unavailable)

    result = asyncio.run(
        problem_practice_service.static_playlist_drills("google", "curated")
    )

    assert len(result["drills"]) == 50
    assert result["drills"][0]["id"] == "playlist-google-1-two-sum"
