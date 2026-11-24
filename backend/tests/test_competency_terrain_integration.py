"""The Journey competency terrain is one aggregate query; check its maths against real Postgres.

Test submissions carry a tag no real data uses, and only that tag is mapped to an algorithm, so
the rest of the database never reaches the result.
"""

from __future__ import annotations

import asyncio
from datetime import date, datetime, timezone

import asyncpg
import pytest

from app.config import settings
from app.repositories import attempts_repository
from app.repositories.submission_signal_repository import definition_refs, insert_evaluation

TAG = "zz-competency-test"
ALIAS = "zz-competency-alias"
OTHER = "zz-competency-other"
INTERACTION = "competency-terrain-test"


def _evaluation(dimensions: dict, modifiers: dict | None = None) -> dict:
    return {"dimensions": dimensions, "modifiers": modifiers or {}}


def _entry(status: str, score: float) -> dict:
    return {"status": status, "score": score}


# (created_at UTC, tags, evaluation). Keys are MCQ signal definitions; the evaluations are stored
# relationally, exactly as the app writes them.
SUBMISSIONS = [
    # Jan 1 (New York): two answers. Scored entries 100, 60, 80 (+ 50 from the second) → 72.5.
    # The not_applicable and unavailable entries don't count; a modifier does; 140 clamps to 100.
    (datetime(2026, 1, 1, 15, tzinfo=timezone.utc), ["skill-map", TAG],
     _evaluation({"correctness": _entry("pass", 100), "nearMiss": _entry("not_applicable", 0),
                  "conceptRecognition": _entry("partial", 60)},
                 {"completionTime": _entry("fail", 80), "distractorMisconception": _entry("unavailable", 0)})),
    (datetime(2026, 1, 1, 16, tzinfo=timezone.utc), ["skill-map", ALIAS],
     _evaluation({"correctness": _entry("fail", 50)})),
    # 03:30 UTC on Jan 5 is 22:30 on Jan 4 in New York: a new practice day at 100 (clamped from 140).
    (datetime(2026, 1, 5, 3, 30, tzinfo=timezone.utc), ["skill-map", TAG],
     _evaluation({"correctness": _entry("pass", 140)})),
    # A second algorithm, practised on Jan 5 only (local), at 40.
    (datetime(2026, 1, 5, 15, tzinfo=timezone.utc), ["skill-map", OTHER],
     _evaluation({"correctness": _entry("fail", 40)})),
    # Not daily work (no skill-map marker): excluded.
    (datetime(2026, 1, 2, 15, tzinfo=timezone.utc), [TAG], _evaluation({"correctness": _entry("fail", 0)})),
]


async def _insert(conn: asyncpg.Connection) -> None:
    definitions = await definition_refs(conn, "mcq")
    for created_at, tags, evaluation in SUBMISSIONS:
        submission_id = await conn.fetchval(
            """INSERT INTO submission (answer, category_tags, elapsed_ms, created_at, interaction_id, modality)
               VALUES ('a', $1, 1, $2, $3, 'mcq') RETURNING id""",
            tags, created_at, INTERACTION,
        )
        await insert_evaluation(conn, submission_id, evaluation, definitions)


async def _run(strong_at: float = 70.0) -> tuple[list[dict], list[dict], list[dict]]:
    from app.database import connect, disconnect

    conn = await asyncpg.connect(settings.database_url)
    try:
        await _insert(conn)
        await connect()
        try:
            tags = {TAG: "zz-algo", ALIAS: "zz-algo"}
            terrain = await attempts_repository.fetch_competency_terrain(
                timezone_name="America/New_York",
                tag_slugs=tags,
                decay_per_day=0.02,
                today=date(2026, 1, 6),
                strong_at=strong_at,
                free_fall_days=1,
            )
            signals = await attempts_repository.fetch_competency_signals(timezone_name="America/New_York", tag_slugs=tags, per_side=2)
            overall = await attempts_repository.fetch_competency_overall(
                timezone_name="America/New_York", tag_slugs={**tags, OTHER: "zz-other"}, decay_per_day=0.02, today=date(2026, 1, 6),
            )
            return terrain, signals, overall
        finally:
            await disconnect()
    finally:
        await conn.execute("DELETE FROM submission WHERE interaction_id = $1", INTERACTION)
        await conn.close()


@pytest.mark.integration
def test_competency_is_the_daily_signal_average_decayed_on_days_without_practice() -> None:
    rows, signals, overall = asyncio.run(_run())
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


    # Recency and the label come from the same query (strong at 70 by default).
    assert first["days_since"] == 0 and first["last_average"] == 72.5 and first["standing"] == "strong"
    third = by_day["2026-01-03"]  # 72.5 decayed twice is 69.6: below 70, but it was strong
    assert third["days_since"] == 2 and third["last_average"] == 72.5 and third["standing"] == "review"
    assert by_day["2026-01-06"]["standing"] == "strong"
    # Free fall after more than 1 day without practice (the threshold passed in).
    assert [by_day[day]["free_fall"] for day in ("2026-01-01", "2026-01-02", "2026-01-03")] == [False, False, True]

    # All-time signal averages: correctness 100, 50, 100 → 83.3; completion time 80; concept
    # recognition 60. With 3 signals and 2 per side they split 2 strongest / 1 weakest.
    assert [(row["side"], row["key"], row["average"], row["answers"]) for row in signals] == [
        ("strongest", "correctness", 83.3, 3),
        ("strongest", "completionTime", 80.0, 1),
        ("weakest", "conceptRecognition", 60.0, 1),
    ]

    # Overall: the mean of every practised algorithm's competency that day. Only zz-algo until
    # Jan 5, when zz-other starts at 40.
    overall_by_day = {row["day"].isoformat(): row for row in overall}
    assert overall_by_day["2026-01-01"]["competency"] == 72.5 and overall_by_day["2026-01-01"]["algorithms"] == 1
    assert overall_by_day["2026-01-05"]["algorithms"] == 2
    assert overall_by_day["2026-01-05"]["competency"] == pytest.approx((by_day["2026-01-05"]["competency"] + 40) / 2, abs=0.051)

    # The week's change: with under 7 days of history it is measured from the first day.
    jan6 = overall_by_day["2026-01-06"]
    assert jan6["week_change"] == pytest.approx(jan6["competency"] - 72.5, abs=0.051)
    assert overall_by_day["2026-01-01"]["week_change"] == 0 and overall_by_day["2026-01-01"]["trend"] == "maintaining"
    assert overall_by_day["2026-01-02"]["trend"] == "maintaining"  # -1.5: within 2 points
    assert overall_by_day["2026-01-03"]["trend"] == "regressing"  # -2.9
    assert overall_by_day["2026-01-04"]["trend"] == "improving"  # back to 100: +27.5


@pytest.mark.integration
def test_an_algorithm_never_at_the_strong_line_is_to_learn() -> None:
    rows, _signals, _overall = asyncio.run(_run(strong_at=80.0))
    by_day = {row["day"].isoformat(): row for row in rows}
    assert by_day["2026-01-01"]["standing"] == "learn"  # 72.5 < 80 on the day it was practised
    assert by_day["2026-01-04"]["standing"] == "strong"
    assert by_day["2026-01-06"]["standing"] == "strong"  # 96.0 is still above 80
