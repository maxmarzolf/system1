"""The committed OpenAPI document must match the API, so the frontend types stay in sync."""

from __future__ import annotations

import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "export_openapi.py"


def _exporter():
    spec = importlib.util.spec_from_file_location("export_openapi", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_committed_openapi_matches_the_api() -> None:
    exporter = _exporter()
    committed = exporter.DEFAULT_OUTPUT.read_text()
    assert committed == exporter.openapi_document(), (
        "src/api/openapi.json is stale: run `python backend/scripts/export_openapi.py && npm run gen:api`"
    )


def test_every_json_route_declares_a_response_schema() -> None:
    import json

    document = json.loads(_exporter().openapi_document())
    untyped = [
        f"{method.upper()} {path}"
        for path, operations in document["paths"].items()
        for method, operation in operations.items()
        for status, response in operation["responses"].items()
        if status.startswith("2") and response.get("content", {}).get("application/json", {}).get("schema") == {}
    ]
    assert untyped == ["POST /api/coach/skill-map-drills-stream"]  # server-sent events, not JSON
