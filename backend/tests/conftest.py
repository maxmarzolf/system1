from __future__ import annotations

import asyncio

import asyncpg
import pytest

from app.models import SkillMapDrillsRequest, SkillMapNode, TemplateMode
from app.services.evaluators import EVALUATORS
from app.services.evaluators.defaults import register_default_evaluators


@pytest.fixture(scope="session")
def migrated_database():
    """Create the schema before integration tests that seed rows without starting the app."""
    from app.config import settings
    from app.database import connect, disconnect

    async def bootstrap() -> None:
        await connect()
        await disconnect()

    try:
        asyncio.run(bootstrap())
    except (OSError, asyncpg.PostgresError) as exc:  # pragma: no cover - infrastructure guard
        pytest.skip(f"Postgres not available for integration test: {exc}")


@pytest.fixture(autouse=True)
def integration_schema(request):
    if request.node.get_closest_marker("integration"):
        request.getfixturevalue("migrated_database")


@pytest.fixture(autouse=True)
def default_evaluators():
    """Register evaluators the way the app factory does, and undo test overrides afterwards."""
    saved = dict(EVALUATORS)
    EVALUATORS.clear()
    register_default_evaluators()
    yield
    EVALUATORS.clear()
    EVALUATORS.update(saved)


@pytest.fixture
def skill_map_request() -> SkillMapDrillsRequest:
    return SkillMapDrillsRequest(
        questionType="skill-map",
        count=2,
        templateMode=TemplateMode.algorithm,
        templateTargets={},
        llmProvider="openai",
        skillMap=[
            SkillMapNode(algorithm="sliding-window", skills=["expand-shrink"]),
            SkillMapNode(algorithm="two-pointers", skills=["left-right"]),
        ],
    )


@pytest.fixture
def progress_summary() -> dict:
    return {
        "overall": {"attemptCount": 4, "successRate": 75.0},
        "patterns": {
            "sliding-window": {"attemptCount": 3, "readiness": 62, "successRate": 66.7},
            "two-pointers": {"attemptCount": 1, "readiness": 95, "successRate": 100},
        },
    }


@pytest.fixture
def llm_drills_payload() -> dict:
    return {
        "drills": [
            {
                "id": "llm-1",
                "title": "Sliding Window Core",
                "difficulty": "medium",
                "prompt": "Algorithm: recall sliding window update loop.",
                "solution": "def solve(nums):\n    out = []\n    for n in nums:\n        {{missing}}\n    return out",
                "missing": "out.append(n)",
                "hint": "Track window state and update per element.",
                "tags": ["skill-map", "sliding-window"],
            },
            {
                "id": "llm-2",
                "title": "Two Pointers Core",
                "difficulty": "hard",
                "prompt": "Algorithm: recall pointer movement rule.",
                "solution": "def solve(nums):\n    left, right = 0, len(nums)-1\n    while left < right:\n        {{missing}}\n    return left",
                "missing": "left += 1",
                "hint": "Move one side based on the decision rule.",
                "tags": ["skill-map", "two-pointers"],
            },
        ]
    }
