"""Small read-model helpers and the read paths behind /api/skill-map and /api/skill-map-overview."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.services.read_models import common as read_common, overview


@pytest.mark.parametrize(
    ("row", "expected"),
    [({"modality": "ghost-rep"}, "ghost-rep"), ({"modality": " mcq "}, "mcq"), ({}, "total-recall")],
)
def test_submission_modality_reads_the_stored_column(row, expected) -> None:
    assert read_common.submission_modality(row) == expected


def test_coerce_utc_datetime_accepts_datetimes_and_iso_strings() -> None:
    naive = datetime(2026, 1, 2, 3, 4)
    assert read_common.coerce_utc_datetime(naive) == naive.replace(tzinfo=timezone.utc)
    offset = datetime(2026, 1, 2, 5, 4, tzinfo=timezone(timedelta(hours=2)))
    assert read_common.coerce_utc_datetime(offset) == naive.replace(tzinfo=timezone.utc)
    assert read_common.coerce_utc_datetime("2026-01-02T03:04:00Z") == naive.replace(tzinfo=timezone.utc)
    assert read_common.coerce_utc_datetime("2026-01-02T03:04:00") == naive.replace(tzinfo=timezone.utc)
    for bad in ("", "  ", "yesterday", 12, None):
        assert read_common.coerce_utc_datetime(bad) is None


def test_build_skill_map_nodes_groups_skills_by_algorithm() -> None:
    rows = [
        {"algorithm_id": 1, "algorithm_name": "Sliding Window", "skill_id": 1, "skill_name": "expand"},
        {"algorithm_id": 1, "algorithm_name": "Sliding Window", "skill_id": 2, "skill_name": "shrink"},
        {"algorithm_id": 2, "algorithm_name": "Heap", "skill_id": None, "skill_name": None},
    ]
    nodes = overview.build_skill_map_nodes(rows)
    assert [(node.algorithm, node.skills) for node in nodes] == [("Sliding Window", ["expand", "shrink"]), ("Heap", [])]


async def test_get_skill_map_reads_rows(monkeypatch) -> None:
    async def rows():
        return [{"algorithm_id": 1, "algorithm_name": "Heap", "skill_id": None, "skill_name": None}]

    monkeypatch.setattr(overview, "fetch_algorithms_with_skills_rows", rows)
    assert [node.algorithm for node in await overview.get_skill_map()] == ["Heap"]


async def test_get_skill_map_overview_passes_window_and_timezone(monkeypatch) -> None:
    captured: dict = {}

    async def empty():
        return []

    def build(algorithm_rows, generated_rows, attempt_rows, *, history_days, history_tz):
        captured.update(history_days=history_days, history_tz=history_tz)
        return {"algorithms": []}

    for name in (
        "fetch_skill_map_overview_algorithm_rows",
        "fetch_skill_map_overview_generated_rows",
        "fetch_skill_map_overview_attempt_rows",
    ):
        monkeypatch.setattr(overview, name, empty)
    monkeypatch.setattr(overview, "build_skill_map_overview", build)

    assert await overview.get_skill_map_overview(None, "America/New_York") == {"algorithms": []}
    assert captured["history_days"] is None
    assert str(captured["history_tz"]) == "America/New_York"
