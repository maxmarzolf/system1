from __future__ import annotations

import pytest

from app.core.generator import _process_multiple_choice_card, generate_multiple_choice_drills_response
from app.models import MultipleChoiceDrillsRequest, SkillMapNode
from app.repositories.coach_repository import _multiple_choice_question_fingerprint


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
    assert [choice["id"] for choice in processed["choices"]] == ["A", "B", "C", "D"]
    correct_choice = next(choice for choice in processed["choices"] if choice["id"] == processed["correctChoiceId"])
    assert correct_choice["text"] == "The answer space is monotonic."
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
    assert sorted(choice["text"] for choice in processed["choices"]) == sorted([
        "```python\nleft += 1\n```",
        "Shrink after every index.",
        "Reset the whole map each step.",
        "Sort the window before comparing.",
    ])
    correct_choice = next(choice for choice in processed["choices"] if choice["id"] == processed["correctChoiceId"])
    assert correct_choice["text"] == "```python\nleft += 1\n```"
    assert "```python\nwindow_count[ch] += 1\n```" in processed["explanation"]


def test_multiple_choice_question_fingerprint_is_shuffle_stable() -> None:
    card_a = {
        "question": "Which update keeps the window score current?",
        "choices": [
            {"id": "A", "text": "left += 1"},
            {"id": "B", "text": "sort(nums)"},
            {"id": "C", "text": "reset_map()"},
            {"id": "D", "text": "return mid"},
        ],
        "correctChoiceId": "A",
    }
    card_b = {
        "question": " Which update keeps the window score current? ",
        "choices": [
            {"id": "A", "text": "sort(nums)"},
            {"id": "B", "text": "return mid"},
            {"id": "C", "text": "left += 1"},
            {"id": "D", "text": "reset_map()"},
        ],
        "correctChoiceId": "C",
    }

    assert _multiple_choice_question_fingerprint(card_a) == _multiple_choice_question_fingerprint(card_b)


@pytest.mark.asyncio
async def test_generate_multiple_choice_drills_response_calls_persist_callback() -> None:
    request = MultipleChoiceDrillsRequest(
        count=1,
        skillMap=[SkillMapNode(pattern="Binary Search", methods=["left / right bounds"])],
        difficulty="Hard",
    )
    persisted: dict[str, object] = {}

    def call_llm_json(*_args, **_kwargs):
        return {
            "drills": [
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
                }
            ]
        }

    async def persist_generated_questions(drills):
        persisted["count"] = len(drills)
        persisted["question"] = drills[0]["question"]

    response = await generate_multiple_choice_drills_response(
        request,
        provider="openai",
        provider_label="ChatGPT",
        provider_available=True,
        call_llm_json=call_llm_json,
        persist_generated_questions=persist_generated_questions,
    )

    assert response.llmUsed is True
    assert len(response.drills) == 1
    assert persisted == {
        "count": 1,
        "question": "What makes binary search safe?",
    }


@pytest.mark.asyncio
async def test_generate_multiple_choice_drills_response_is_fail_open_when_persist_fails() -> None:
    request = MultipleChoiceDrillsRequest(
        count=1,
        skillMap=[SkillMapNode(pattern="Binary Search", methods=["left / right bounds"])],
        difficulty="Hard",
    )

    def call_llm_json(*_args, **_kwargs):
        return {
            "drills": [
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
                }
            ]
        }

    async def persist_generated_questions(_drills):
        raise RuntimeError("db unavailable")

    response = await generate_multiple_choice_drills_response(
        request,
        provider="openai",
        provider_label="ChatGPT",
        provider_available=True,
        call_llm_json=call_llm_json,
        persist_generated_questions=persist_generated_questions,
    )

    assert response.llmUsed is True
    assert len(response.drills) == 1


@pytest.mark.asyncio
async def test_generate_multiple_choice_drills_response_falls_back_to_next_provider() -> None:
    request = MultipleChoiceDrillsRequest(
        count=1,
        skillMap=[SkillMapNode(pattern="Binary Search", methods=["left / right bounds"])],
        difficulty="Hard",
    )
    providers_seen: list[str] = []

    def call_llm_json(_system_prompt, _payload, provider, _max_tokens, _timeout_seconds, _temperature):
        providers_seen.append(provider)
        if provider == "claude":
            return None
        return {
            "drills": [
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
                }
            ]
        }

    response = await generate_multiple_choice_drills_response(
        request,
        provider="claude",
        provider_label="Claude",
        provider_available=True,
        call_llm_json=call_llm_json,
        fallback_providers=[
            ("claude", "Claude", True),
            ("openai", "ChatGPT", True),
        ],
    )

    assert providers_seen == ["claude", "claude", "claude", "openai"]
    assert response.llmUsed is True
    assert len(response.drills) == 1


@pytest.mark.asyncio
async def test_generate_multiple_choice_drills_response_retries_transient_provider_failures() -> None:
    request = MultipleChoiceDrillsRequest(
        count=1,
        skillMap=[SkillMapNode(pattern="Binary Search", methods=["left / right bounds"])],
        difficulty="Hard",
    )
    attempts = {"count": 0}

    def call_llm_json(_system_prompt, _payload, _provider, _max_tokens, _timeout_seconds, _temperature):
        attempts["count"] += 1
        if attempts["count"] < 3:
            return None
        return {
            "drills": [
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
                }
            ]
        }

    response = await generate_multiple_choice_drills_response(
        request,
        provider="claude",
        provider_label="Claude",
        provider_available=True,
        call_llm_json=call_llm_json,
        fallback_providers=[("claude", "Claude", True)],
        retry_delays_seconds=(0, 0),
    )

    assert attempts["count"] == 3
    assert response.llmUsed is True
    assert len(response.drills) == 1
