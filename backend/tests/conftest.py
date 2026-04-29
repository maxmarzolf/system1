from __future__ import annotations

import pytest

from app.models import SkillMapDrillsRequest, SkillMapNode, TemplateMode


@pytest.fixture
def skill_map_request() -> SkillMapDrillsRequest:
    return SkillMapDrillsRequest(
        questionType="skill-map",
        count=2,
        templateMode=TemplateMode.algorithm,
        templateTargets={},
        llmProvider="openai",
        skillMap=[
            SkillMapNode(pattern="sliding-window", methods=["expand-shrink"]),
            SkillMapNode(pattern="two-pointers", methods=["left-right"]),
        ],
    )


@pytest.fixture
def progress_summary() -> dict:
    return {
        "overall": {"attemptCount": 4, "avgAccuracy": 77.5},
        "patterns": {
            "sliding-window": {"attemptCount": 3, "readiness": 62, "avgAccuracy": 70},
            "two-pointers": {"attemptCount": 1, "readiness": 95, "avgAccuracy": 88},
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
                "hint": "Move one side based on invariant.",
                "tags": ["skill-map", "two-pointers"],
            },
        ]
    }
