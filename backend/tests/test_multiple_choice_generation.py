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


def test_process_multiple_choice_card_normalizes_python_code_blocks() -> None:
    request = MultipleChoiceDrillsRequest(
        count=1,
        skillMap=[SkillMapNode(pattern="Sliding Window", methods=["expand / shrink rhythm"])],
        difficulty="Med.",
    )

    processed = _process_multiple_choice_card(
        {
            "title": "Sliding Window Update",
            "pattern": "Sliding Window",
            "difficulty": "Med.",
            "question": "Which update keeps the window score current?\n```python\nl,r=0,len(nums)-1\nwhile l<r:\n  s=nums[l]+nums[r]\n```",
            "choices": [
                {"id": "A", "text": "```python\nleft += 1   \n```"},
                {"id": "B", "text": "Shrink after every index."},
                {"id": "C", "text": "Reset the whole map each step."},
                {"id": "D", "text": "Sort the window before comparing."},
            ],
            "correctChoiceId": "A",
            "explanation": "The update should preserve state.\n```python\n\twindow_count[ch] += 1   \n```",
            "tags": ["sliding-window"],
        },
        0,
        request,
    )

    assert processed is not None
    assert "```python\nl, r = 0, len(nums) - 1\nwhile l < r:\n    s = nums[l] + nums[r]\n```" in processed["question"]
    assert processed["choices"][0]["text"] == "```python\nleft += 1\n```"
    assert "```python\nwindow_count[ch] += 1\n```" in processed["explanation"]
