"""The Journey competency terrain is one aggregate query; check its maths against real Postgres.

Test submissions carry a tag no real data uses, and only that tag is mapped to an algorithm, so
the rest of the database never reaches the result.
"""

from __future__ import annotations

import asyncio
import json
from datetime import date, datetime, timezone

import asyncpg
import pytest

from app.config import settings
from app.repositories import attempts_repository

TAG = "zz-competency-test"
ALIAS = "zz-competency-alias"
INTERACTION = "competency-terrain-test"


def _evaluation(dimensions: dict, modifiers: dict | None = None) -> str:
    return json.dumps({"elapsed_ms": 1, "evaluation": {"dimensions": dimensions, "modifiers": modifiers or {}}})


def _entry(status: str, score: float) -> dict:
    return {"status": status, "score": score}


# (created_at UTC, tags, question_type, signals)
SUBMISSIONS = [
    # Jan 1 (New York): two answers. Scored entries 100, 60, 80 (+ 50 from the second) → 72.5.
    # The not_applicable and unavailable entries don't count; a modifier does; 140 clamps to 100.
    (datetime(2026, 1, 1, 15, tzinfo=timezone.utc), ["skill-map", TAG], "skill-map-mcq",
     _evaluation({"correctness": _entry("pass", 100), "nearMiss": _entry("not_applicable", 0),
                  "structure": _entry("partial", 60)}, {"speed": _entry("fail", 80), "x": _entry("unavailable", 0)})),
    (datetime(2026, 1, 1, 16, tzinfo=timezone.utc), ["skill-map", ALIAS], "skill-map-recall",
     _evaluation({"correctness": _entry("fail", 50)})),
    # 03:30 UTC on Jan 5 is 22:30 on Jan 4 in New York: a new practice day at 100 (clamped from 140).
    (datetime(2026, 1, 5, 3, 30, tzinfo=timezone.utc), ["skill-map", TAG], "skill-map-mcq",
     _evaluation({"correctness": _entry("pass", 140)})),
    # Not daily work (no skill-map marker): excluded.
    (datetime(2026, 1, 2, 15, tzinfo=timezone.utc), [TAG], "standalone", _evaluation({"correctness": _entry("fail", 0)})),
]


async def _insert(conn: asyncpg.Connection) -> None:
    for created_at, tags, question_type, signals in SUBMISSIONS:
        await conn.execute(
            """INSERT INTO submission (answer, question_type, category_tags, signals, created_at, interaction_id, modality)
               VALUES ('a', $1, $2, $3::jsonb, $4, $5, 'mcq')""",
            question_type, tags, signals, created_at, INTERACTION,
        )


async def _run() -> list[dict]:
    from app.database import connect, disconnect

    conn = await asyncpg.connect(settings.database_url)
    try:
        await _insert(conn)
        await connect()
        try:
            return await attempts_repository.fetch_competency_terrain(
                timezone_name="America/New_York",
                tag_slugs={TAG: "zz-algo", ALIAS: "zz-algo"},
                decay_per_day=0.02,
                today=date(2026, 1, 6),
            )
        finally:
            await disconnect()
    finally:
        await conn.execute("DELETE FROM submission WHERE interaction_id = $1", INTERACTION)
        await conn.close()


@pytest.mark.integration
def test_competency_is_the_daily_signal_average_decayed_on_days_without_practice() -> None:
    rows = asyncio.run(_run())
    by_day = {row["day"].isoformat(): row for row in rows}

    assert {row["algorithm"] for row in rows} == {"zz-algo"}
    assert list(by_day) == ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05", "2026-01-06"]

    first = by_day["2026-01-01"]
    assert first["observed"] is True and first["answers"] == 2 and first["signals"] == 4
    assert first["average"] == first["competency"] == 72.5

    # Days without practice: the last practised average, decayed 2% per day (compounded), to 1 dp.
    assert by_day["2026-01-02"]["observed"] is False and by_day["2026-01-02"]["average"] is None
    assert by_day["2026-01-02"]["competency"] == pytest.approx(72.5 * 0.98, abs=0.051)
    assert by_day["2026-01-03"]["competency"] == pytest.approx(72.5 * 0.98**2, abs=0.051)
    assert by_day["2026-01-03"]["last_practised"] == date(2026, 1, 1)

    # A late-evening answer lands on its local day and resets the value; decay resumes from it.
    assert by_day["2026-01-04"]["observed"] is True and by_day["2026-01-04"]["competency"] == 100.0
    assert by_day["2026-01-06"]["competency"] == pytest.approx(100 * 0.98**2, abs=0.051)
    assert by_day["2026-01-06"]["last_practised"] == date(2026, 1, 4)
