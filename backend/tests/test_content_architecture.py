from __future__ import annotations

from pathlib import Path


BACKEND_APP = Path(__file__).parents[1] / "app"


def _runtime_source() -> str:
    chunks: list[str] = []
    for path in sorted(BACKEND_APP.rglob("*.py")):
        if path.name == "database.py":
            continue
        chunks.append(path.read_text())
    return "\n".join(chunks)


def test_runtime_has_no_practice_content_tables() -> None:
    source = _runtime_source()
    for table_name in (
        "practice_item",
        "practice_item_focus_profile",
        "practice_item_generation_event",
        "practice_item_related_problem",
        "playlist_item",
        "playlist_ordering",
        "generated_skill_map_cards",
    ):
        assert f" {table_name}" not in source
        assert f"({table_name}" not in source
        assert f"{table_name} " not in source


def test_runtime_generated_content_targets_problem_repository() -> None:
    source = (BACKEND_APP / "services" / "coach_orchestration_service.py").read_text()
    repository = (BACKEND_APP / "repositories" / "unified_catalog_repository.py").read_text()

    assert "upsert_generated_problem" in source
    assert "INSERT INTO problem" in repository
    assert "INSERT INTO generated_skill_map_cards" not in repository


def test_submission_write_path_populates_problem_slug() -> None:
    repository = (BACKEND_APP / "repositories" / "attempts_repository.py").read_text()
    migration = (BACKEND_APP / "database.py").read_text()

    assert "generated_card_id, problem_slug, generated_card" in repository
    assert "SELECT slug FROM problem WHERE slug = $1" in repository
    assert "submission_problem_slug_fkey" in migration
