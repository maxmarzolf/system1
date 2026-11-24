"""Migrations 0016/0017: submission.signals becomes relational, without losing a value.

Each test builds a throwaway database at 0015, stores one submission of every evaluation shape
the app has ever written (plus the old correctness directives and their history), and upgrades.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import Awaitable, Callable

import asyncpg
import pytest
from alembic import command
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import settings
from app.contracts.evaluation_rows import same
from app.migrations import runner
from app.repositories.submission_signal_repository import fetch_evaluations

LEGACY = {  # the retired LLM grader: a rubric only, with keys no definition has
    "version": 1,
    "verdict": "close",
    "signalSpec": {"algorithm": "sliding-window", "version": 3},
    "score": {"overall": 64.0, "conceptual": 70.0},
    "dimensions": {
        "correctness": {"key": "correctness", "label": "Correctness", "status": "fail", "score": 0.0,
                        "evidence": [], "missing": []},
        "syntax": {"key": "syntax", "label": "Syntax and executability", "status": "pass", "score": 100.0,
                   "evidence": ["parses"], "missing": []},
    },
    "modifiers": {},
    "primaryFailure": {"key": "correctness", "label": "Correctness", "severity": "blocking", "evidence": []},
    "recommendedAction": "",
    "feedback": {"fullFeedback": "Close."},
    "provenance": {"llmUsed": True, "provider": "openai", "source": "assessor"},
}
JEV = {  # the current pipeline: signal results, correctness, a spec snapshot with weights
    "version": 1,
    "verdict": "sound",
    "signalSpec": {"algorithm": "default", "version": 2, "modality": "mcq", "hash": "abc"},
    "score": {"overall": 91.5},
    "dimensions": {
        "correctness": {"key": "correctness", "label": "Correct choice", "status": "pass", "score": 100.0,
                        "evidence": [], "missing": []},
        "nearMiss": {"key": "nearMiss", "label": "Near miss", "status": "not_applicable", "score": 0.0,
                     "evidence": [], "missing": []},
    },
    "modifiers": {
        "completionTime": {"key": "completionTime", "label": "Speed", "status": "pass", "score": 88.0,
                           "evidence": [], "missing": []},
    },
    "feedback": {},
    "provenance": {"llmUsed": True, "provider": "jev", "source": "jev", "engine": "jev", "model": "jev-x",
                   "flags": ["low_correctness_confidence"], "requestIds": ["r1"]},
    "correctness": {"source": "jev", "label": "1", "confidence": 0.55, "answerKeyAgreement": True, "probabilities": {"1": 0.55}},
    "signalResults": {
        "nearMiss": {"key": "nearMiss", "label": "Near miss", "role": "dimension", "status": "not_applicable",
                     "raw": None, "score": None, "confidence": None, "note": ""},
        "completionTime": {"key": "completionTime", "label": "Speed", "role": "modifier", "status": "scored",
                           "raw": 12, "score": 88.0, "confidence": None, "note": "12s"},
    },
    "signalSpecSnapshot": {"correctnessWeight": 0.6, "signals": [{"key": "nearMiss", "weight": 0.1},
                                                                 {"key": "completionTime", "weight": 0.05}]},
    "jevTrace": [{"requestId": "r1"}],
}
ANSWER_KEY = {  # an MCQ graded by its answer key when Jev was down
    "version": 1,
    "verdict": "needs-work",
    "signalSpec": {"algorithm": "default", "version": 1},
    "score": {"overall": 0.0},
    "dimensions": {"correctness": {"key": "correctness", "label": "Correct choice", "status": "fail", "score": 0.0,
                                   "evidence": [], "missing": []}},
    "modifiers": {},
    "provenance": {"llmUsed": False, "provider": "", "source": "answer-key", "engine": "answer-key"},
}


def _url(name: str) -> str:
    return settings.database_url.rsplit("/", 1)[0] + "/" + name


async def _upgrade(url: str, target: str) -> None:
    config = runner.alembic_config(url)
    engine = create_async_engine(config.get_main_option("sqlalchemy.url"), poolclass=pool.NullPool)
    try:
        async with engine.connect() as connection:
            def run(sync_connection):
                config.attributes["connection"] = sync_connection
                command.upgrade(config, target)
            await connection.run_sync(run)
            await connection.commit()
    finally:
        await engine.dispose()


async def _seed_at_0015(url: str) -> dict[str, int]:
    await _upgrade(url, "0015")
    conn = await asyncpg.connect(url)
    try:
        for modality, source in (("mcq", "jev"), ("total-recall", "jev"), ("ghost-rep", "deterministic")):
            await conn.execute(
                "INSERT INTO signal_evaluation_directive (modality, instructions, criteria, correctness_weight, correctness_source, version) "
                "VALUES ($1, $2, $3::jsonb, 0.6, $4, 3)",
                modality, f"Was the {modality} answer correct?", json.dumps({"1": "correct", "0": "incorrect"}), source,
            )
        await conn.execute(
            "INSERT INTO signal_definition_revision (subject, action, after) VALUES ('directive:mcq', 'update', '{}'::jsonb)"
        )
        await conn.execute(
            "INSERT INTO signal_definition (key, modality, label, source, primitive, role, weight, criteria) "
            "VALUES ('nearMiss', 'mcq', 'Near miss', 'jev', 'choice', 'dimension', 0.2, '[\"Far\",\"Near\"]')"
        )
        await conn.execute(
            "INSERT INTO signal_definition (key, modality, label, source, implementation, role, weight) "
            "VALUES ('completionTime', 'mcq', 'Speed', 'deterministic', 'completionTime', 'modifier', 0.1)"
        )
        ids = {}
        for name, modality, signals in (
            ("legacy", "total-recall", {"elapsed_ms": 3200, "evaluation": LEGACY, "modality": {"kind": "total-recall"}}),
            ("jev", "mcq", {"elapsed_ms": 900, "evaluation": JEV,
                            "flow": {"anchorCardId": "card-1", "runId": "r"}, "modality": {"kind": "mcq"}}),
            ("answer_key", "mcq", {"elapsed_ms": 0, "evaluation": ANSWER_KEY}),
            ("ungraded", "ghost-rep", {"elapsed_ms": 40, "modality": {"kind": "ghost-rep", "exact": True}}),
        ):
            ids[name] = await conn.fetchval(
                "INSERT INTO submission (answer, modality, signals) VALUES ('a', $1, $2::jsonb) RETURNING id",
                modality, json.dumps(signals),
            )
        return ids
    finally:
        await conn.close()


async def _in_scratch_database(body: Callable[[str], Awaitable[object]]) -> object:
    name = f"fx_signals_{uuid.uuid4().hex[:12]}"
    admin = await asyncpg.connect(settings.database_url)
    try:
        await admin.execute(f'CREATE DATABASE "{name}"')
        try:
            return await body(_url(name))
        finally:
            await admin.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
    finally:
        await admin.close()


def _run(body: Callable[[str], Awaitable[object]]) -> object:
    try:
        return asyncio.run(_in_scratch_database(body))
    except (OSError, asyncpg.PostgresError) as exc:  # pragma: no cover - environment-dependent integration guard
        pytest.skip(f"Postgres not available for integration test: {exc}")


async def _migrate_and_read(url: str) -> dict:
    ids = await _seed_at_0015(url)
    await _upgrade(url, "head")
    conn = await asyncpg.connect(url)
    try:
        signals = [dict(row) for row in await conn.fetch(
            "SELECT s.submission_id, d.key, d.status AS definition_status, s.role, s.status, s.score, s.grade, s.weight, "
            "s.definition_version, s.value_kind, s.value_text, s.value_number, s.confidence, s.source, s.model, s.evidence "
            "FROM submission_signal s JOIN signal_definition d ON d.id = s.signal_definition_id ORDER BY s.submission_id, s.position"
        )]
        return {
            "ids": ids,
            "version": await conn.fetchval("SELECT version_num FROM alembic_version"),
            "evaluations": await fetch_evaluations(conn, ids.values()),
            "evaluation_rows": {row["submission_id"]: dict(row) for row in await conn.fetch("SELECT * FROM submission_evaluation")},
            "signals": signals,
            "submissions": {row["id"]: dict(row) for row in await conn.fetch(
                "SELECT id, elapsed_ms, flow_context, modality_context FROM submission")},
            "correctness": {row["modality"]: dict(row) for row in await conn.fetch(
                "SELECT modality, source, primitive, weight, version, instructions, role FROM signal_definition WHERE key = 'correctness'")},
            "subjects": [row["subject"] for row in await conn.fetch("SELECT subject FROM signal_definition_revision ORDER BY id")],
            "dropped": await conn.fetchval(
                "SELECT to_regclass('signal_evaluation_directive') IS NULL AND NOT EXISTS (SELECT 1 FROM information_schema.columns "
                "WHERE table_name = 'submission' AND column_name = 'signals')"
            ),
        }
    finally:
        await conn.close()


@pytest.mark.integration
def test_every_stored_evaluation_moves_to_rows_and_reads_back_identically() -> None:
    result = _run(_migrate_and_read)
    ids = result["ids"]
    assert result["version"] == "0017" and result["dropped"] is True

    # Read back from the rows, every evaluation is exactly the JSON that was stored.
    for name, original in (("legacy", LEGACY), ("jev", JEV), ("answer_key", ANSWER_KEY)):
        assert same(result["evaluations"][ids[name]], original), name
    assert ids["ungraded"] not in result["evaluations"]

    # The evaluation's facts are columns.
    jev_row = result["evaluation_rows"][ids["jev"]]
    assert (jev_row["verdict"], jev_row["overall_score"], jev_row["engine"], jev_row["model"]) == ("sound", 91.5, "jev", "jev-x")
    assert (jev_row["correctness_source"], jev_row["correctness_label"], jev_row["answer_key_agreement"]) == ("jev", "1", True)
    assert list(jev_row["flags"]) == ["low_correctness_confidence"] and jev_row["extra"] is None

    rows = {(row["submission_id"], row["key"]): row for row in result["signals"]}
    # Jev pipeline: correctness from Jev, a Jev signal, a deterministic one; weights as graded.
    correctness = rows[(ids["jev"], "correctness")]
    assert (correctness["role"], correctness["source"], correctness["model"]) == ("correctness", "jev", "jev-x")
    assert (correctness["value_kind"], correctness["value_text"], correctness["confidence"]) == ("text", "1", 0.55)
    assert (correctness["score"], correctness["weight"], correctness["definition_version"]) == (100.0, 0.6, 3)
    near = rows[(ids["jev"], "nearMiss")]
    assert (near["status"], near["score"], near["source"], near["weight"]) == ("not_applicable", None, "jev", 0.1)
    speed = rows[(ids["jev"], "completionTime")]
    assert (speed["role"], speed["status"], speed["score"], speed["source"], speed["model"]) == ("modifier", "scored", 88.0, "deterministic", None)
    assert (speed["value_kind"], speed["value_number"]) == ("integer", 12.0)

    # Legacy LLM grades: source llm-grader with the provider as the model; unknown keys archived.
    syntax = rows[(ids["legacy"], "syntax")]
    assert (syntax["definition_status"], syntax["source"], syntax["model"], syntax["grade"]) == ("archived", "llm-grader", "openai", "pass")
    assert list(syntax["evidence"]) == ["parses"]
    assert rows[(ids["legacy"], "correctness")]["source"] == "llm-grader"
    assert rows[(ids["answer_key"], "correctness")]["source"] == "answer-key"

    # Context columns.
    submissions = result["submissions"]
    assert submissions[ids["jev"]]["elapsed_ms"] == 900
    assert json.loads(submissions[ids["jev"]]["flow_context"])["anchorCardId"] == "card-1"
    assert json.loads(submissions[ids["ungraded"]]["modality_context"]) == {"kind": "ghost-rep", "exact": True}
    assert submissions[ids["answer_key"]]["flow_context"] is None

    # The directives became correctness definitions (same version), and their history moved.
    mcq = result["correctness"]["mcq"]
    assert (mcq["role"], mcq["source"], mcq["primitive"], mcq["weight"], mcq["version"]) == ("correctness", "jev", "choice", 0.6, 3)
    ghost = result["correctness"]["ghost-rep"]
    assert (ghost["source"], ghost["primitive"]) == ("deterministic", None)
    assert "mcq:correctness" in result["subjects"] and not any(subject.startswith("directive:") for subject in result["subjects"])


async def _missing_row_stops_the_drop(url: str) -> dict:
    ids = await _seed_at_0015(url)
    await _upgrade(url, "0016")
    conn = await asyncpg.connect(url)
    try:
        await conn.execute(
            "DELETE FROM submission_signal WHERE id = (SELECT MIN(id) FROM submission_signal WHERE submission_id = $1)", ids["jev"]
        )
    finally:
        await conn.close()
    try:
        await _upgrade(url, "head")
        error = None
    except RuntimeError as exc:
        error = str(exc)
    conn = await asyncpg.connect(url)
    try:
        return {
            "error": error,
            "version": await conn.fetchval("SELECT version_num FROM alembic_version"),
            "json_kept": await conn.fetchval(
                "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'submission' AND column_name = 'signals')"
            ),
            "jev": ids["jev"],
        }
    finally:
        await conn.close()


@pytest.mark.integration
def test_the_json_is_not_dropped_when_a_signal_row_is_missing() -> None:
    result = _run(_missing_row_stops_the_drop)
    assert result["error"] and f"submission {result['jev']}" in result["error"]
    assert result["version"] == "0016" and result["json_kept"] is True
