from __future__ import annotations

from app.core.coach import _process_multiple_choice_card
from app.models import MultipleChoiceDrillsRequest, SkillMapNode


def test_process_multiple_choice_card_normalizes_tags_and_choices() -> None:
    request = MultipleChoiceDrillsRequest(
        count=1,
        skillMap=[SkillMapNode(pattern="Binary Search", methods=["left / right bounds"])],
        difficulty="Hard",
    )

    processed = _process_multiple_choice_card(
        {
            "title": "Binary Search Boundary",
            "pattern": "Binary Search",
            "difficulty": "Hard",
            "question": "What makes binary search safe?",
            "choices": [
                {"id": "A", "text": "The answer space is monotonic."},
                {"id": "B", "text": "The array is always tiny."},
                {"id": "C", "text": "Every candidate is visited."},
                {"id": "D", "text": "A heap tracks the best midpoint."},
            ],
            "correctChoiceId": "A",
            "explanation": "A monotonic decision lets each midpoint discard one side.",
            "tags": ["binary-search"],
        },
        0,
        request,
    )

    assert processed is not None
    assert processed["difficulty"] == "Hard"
    assert processed["correctChoiceId"] == "A"
    assert processed["choices"][0] == {"id": "A", "text": "The answer space is monotonic."}
    assert processed["tags"] == ["skill-map", "skill-map-mcq", "binary-search"]

