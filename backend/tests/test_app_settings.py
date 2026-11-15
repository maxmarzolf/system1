"""Server-side settings edited on /admin: defaults, merging, validation, versions, endpoints."""

from __future__ import annotations

import asyncio

import asyncpg
import pytest
from fastapi.testclient import TestClient

from app.config import settings as app_config
from app.main import create_app
from app.repositories.app_setting_repository import SettingVersionConflict
from app.services import app_settings_service as service
from app.services import grading_settings_service


@pytest.fixture
def stored(monkeypatch):
    rows: dict[str, tuple[dict, int]] = {}
    writes: list[tuple] = []

    async def fetch():
        return dict(rows)

    async def save(key, value, version):
        writes.append((key, value, version))
        current = rows.get(key, ({}, 0))[1]
        if current != version:
            raise SettingVersionConflict("changed")
        rows[key] = (value, current + 1)
        return current + 1

    monkeypatch.setattr(service.app_setting_repository, "fetch_settings", fetch)
    monkeypatch.setattr(service.app_setting_repository, "save_setting", save)
    return rows, writes


async def test_never_saved_sections_use_their_defaults(stored) -> None:
    everything = await service.all_settings()
    assert {key: section["version"] for key, section in everything.items()} == {"grading": 0, "generation": 0, "practice": 0}
    assert everything["grading"]["value"] == {
        "feedbackModalities": ["total-recall", "microdrill", "ladder"], "nearMissThreshold": 75.0, "lowConfidenceThreshold": 0.6, "competencyDecayPerDay": 0.02,
    }
    assert everything["practice"]["value"] == {"mcqQuestionCount": 5, "mcqFlowMode": "random", "playlistOrder": "mastery"}
    assert everything["generation"]["value"]["mcqModels"]["claude"] == app_config.coach_mcq_anthropic_model


async def test_saved_sections_merge_over_the_defaults(stored) -> None:
    rows, _writes = stored
    rows["generation"] = ({"specimen": {"typeHints": "include"}}, 3)
    generation = await service.generation()
    assert generation.specimen.typeHints == "include" and generation.specimen.comments == "omit"
    assert (await service.all_settings())["generation"]["version"] == 3


async def test_a_stored_value_that_no_longer_validates_falls_back_to_defaults(stored) -> None:
    rows, _writes = stored
    rows["practice"] = ({"mcqQuestionCount": 999}, 1)
    assert (await service.practice()).mcqQuestionCount == 5


async def test_updates_are_validated_ordered_and_versioned(stored) -> None:
    saved = await service.update_section("grading", {"feedbackModalities": ["ladder", "mcq"], "nearMissThreshold": 60}, 0)
    assert saved == {"value": {"feedbackModalities": ["mcq", "ladder"], "nearMissThreshold": 60.0, "lowConfidenceThreshold": 0.6, "competencyDecayPerDay": 0.02}, "version": 1}

    with pytest.raises(service.SettingsConflictError):
        await service.update_section("grading", {"nearMissThreshold": 50}, 0)
    with pytest.raises(service.SettingsValidationError) as invalid:
        await service.update_section("grading", {"feedbackModalities": ["essay"], "nearMissThreshold": 150}, 1)
    assert set(invalid.value.errors) == {"feedbackModalities", "nearMissThreshold"}
    with pytest.raises(service.SettingsValidationError):
        await service.update_section("theme", {}, 0)


async def test_the_pipeline_reads_grading_settings(stored) -> None:
    rows, _writes = stored
    rows["grading"] = ({"feedbackModalities": ["mcq"], "nearMissThreshold": 40, "lowConfidenceThreshold": 0.8}, 2)
    grading = await grading_settings_service.grading_settings()
    assert grading.feedback_modalities == frozenset({"mcq"})
    assert (grading.near_miss_threshold, grading.low_confidence_threshold) == (40.0, 0.8)


def test_settings_endpoints(stored) -> None:
    with TestClient(create_app()) as client:
        practice = client.get("/api/catalog/practice-settings")
        everything = client.get("/api/admin/settings")
        saved = client.put("/api/admin/settings/practice", json={"value": {"mcqQuestionCount": 3}, "version": 0})
        stale = client.put("/api/admin/settings/practice", json={"value": {"mcqQuestionCount": 4}, "version": 0})
        invalid = client.put("/api/admin/settings/practice", json={"value": {"mcqFlowMode": "chaos"}, "version": 1})
        after = client.get("/api/catalog/practice-settings")

    assert practice.json() == {"mcqQuestionCount": 5, "mcqFlowMode": "random", "playlistOrder": "mastery"}
    assert set(everything.json()) == {"grading", "generation", "practice"}
    assert saved.status_code == 200 and saved.json()["version"] == 1
    assert stale.status_code == 409 and stale.json()["detail"]["code"] == "conflict"
    assert invalid.status_code == 422 and "mcqFlowMode" in invalid.json()["detail"]["errors"]
    assert after.json()["mcqQuestionCount"] == 3


async def _db_round_trip() -> tuple[int, int, dict]:
    from app.database import connect, disconnect
    from app.repositories import app_setting_repository

    await connect()
    try:
        conn = await asyncpg.connect(app_config.database_url)
        try:
            await conn.execute("DELETE FROM app_setting WHERE key = 'itest'")
        finally:
            await conn.close()
        first = await app_setting_repository.save_setting("itest", {"a": 1}, 0)
        second = await app_setting_repository.save_setting("itest", {"a": 2}, 1)
        stored = (await app_setting_repository.fetch_settings())["itest"]
        try:
            await app_setting_repository.save_setting("itest", {"a": 3}, 1)
        except SettingVersionConflict:
            pass
        else:  # pragma: no cover
            raise AssertionError("a stale version must conflict")
        conn = await asyncpg.connect(app_config.database_url)
        try:
            await conn.execute("DELETE FROM app_setting WHERE key = 'itest'")
        finally:
            await conn.close()
        return first, second, {"value": stored[0], "version": stored[1]}
    finally:
        await disconnect()


@pytest.mark.integration
def test_settings_round_trip_through_postgres() -> None:
    first, second, stored = asyncio.run(_db_round_trip())
    assert (first, second) == (1, 2)
    assert stored == {"value": {"a": 2}, "version": 2}


async def test_competency_decay_is_bounded(stored) -> None:
    with pytest.raises(service.SettingsValidationError) as error:
        await service.update_section("grading", {"competencyDecayPerDay": 0.9}, 0)
    assert "competencyDecayPerDay" in error.value.errors
    saved = await service.update_section("grading", {"competencyDecayPerDay": 0.05}, 0)
    assert saved["value"]["competencyDecayPerDay"] == 0.05
