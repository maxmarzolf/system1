import pytest

from app.models import SlidingWindowLadderRequest
from app.services import sliding_window_ladder_service as service


@pytest.mark.asyncio
async def test_fixed_ladder_rewrites_each_question_with_card_and_recent_attempts(monkeypatch):
    captured = {}
    monkeypatch.setattr(service, "resolve_available_llm_provider", lambda _: "openai")
    monkeypatch.setattr(service, "llm_provider_available", lambda _: True)

    def generate(prompt, payload, *args):
        captured["prompt"] = prompt
        captured["payload"] = payload
        return {
            "question": "Add the incoming character to counts. Example: {} and 'a' becomes {'a': 1}.",
            "starterCode": "def add_char(counts, ch):\n    pass",
            "solution": "def add_char(counts, ch):\n    counts[ch] = counts.get(ch, 0) + 1",
        }

    monkeypatch.setattr(service, "call_llm_json", generate)
    result = await service.generate_ladder_question(SlidingWindowLadderRequest(
        cardTitle="567. Permutation in String",
        cardPrompt="Find a permutation",
        cardTarget="def solution(s1, s2): ...",
        technique="fixed",
        rungIndex=0,
        rep=2,
        recentAttempts=[{
            "rungIndex": 0,
            "successful": False,
            "weakness": "New character raised KeyError",
            "question": "Add a character to counts",
        }],
    ))
    assert result.rungTitle == "Add window state"
    assert "counts.get" in result.solution
    assert captured["payload"]["cardTitle"] == "567. Permutation in String"
    assert captured["payload"]["rep"] == 2
    assert captured["payload"]["recentAttempts"][0]["weakness"] == "New character raised KeyError"
    assert "fresh concrete scenario" in captured["prompt"]
    assert "complete correct implementation" in captured["prompt"]


@pytest.mark.asyncio
async def test_variable_ladder_uses_valid_shrink_contract(monkeypatch):
    captured = {}
    monkeypatch.setattr(service, "resolve_available_llm_provider", lambda _: "openai")
    monkeypatch.setattr(service, "llm_provider_available", lambda _: True)

    def generate(prompt, payload, *args):
        captured["prompt"] = prompt
        return {
            "question": "Find the minimum positive-number window reaching target.",
            "starterCode": "def shortest(nums, target):\n    pass",
            "solution": "def shortest(nums, target):\n    total = 0\n    best = len(nums) + 1\n    left = 0\n    for right, value in enumerate(nums):\n        total += value\n        while total >= target:\n            best = min(best, right - left + 1)\n            total -= nums[left]\n            left += 1\n    return 0 if best > len(nums) else best",
        }

    monkeypatch.setattr(service, "call_llm_json", generate)
    result = await service.generate_ladder_question(SlidingWindowLadderRequest(
        cardTitle="209. Minimum Size Subarray Sum", technique="variable", rungIndex=3, rep=1,
    ))
    assert result.rungTitle == "Minimize valid window"
    assert "records a shortest valid answer" in captured["prompt"]
    assert "shrinks while still valid" in captured["prompt"]


@pytest.mark.asyncio
async def test_ladder_rewrites_a_repeated_question(monkeypatch):
    monkeypatch.setattr(service, "resolve_available_llm_provider", lambda _: "openai")
    monkeypatch.setattr(service, "llm_provider_available", lambda _: True)
    calls = []

    def generate(prompt, payload, *args):
        calls.append(prompt)
        return {
            "question": "Add a character again." if len(calls) == 1 else "Add a new key safely.",
            "starterCode": "def add_char(counts, ch):\n    pass",
            "solution": "def add_char(counts, ch):\n    counts[ch] = counts.get(ch, 0) + 1",
        }

    monkeypatch.setattr(service, "call_llm_json", generate)
    result = await service.generate_ladder_question(SlidingWindowLadderRequest(
        cardTitle="567. Permutation in String", technique="fixed", rungIndex=0, rep=2,
        recentAttempts=[{"rungIndex": 0, "successful": True, "question": "Add a character again."}],
    ))
    assert result.question == "Add a new key safely."
    assert len(calls) == 2
    assert "previous draft" in calls[1]


@pytest.mark.asyncio
@pytest.mark.parametrize("payload", [
    None,
    {"question": "Fill it", "starterCode": "def add(c, x):\n    return ___", "solution": "def add(c, x):\n    return c + x"},
    {"question": "Write it", "starterCode": "def add(c, x):\n    c[x] = 1", "solution": "def add(c, x):\n    return c + x"},
    {"question": "Write it", "starterCode": "def add(c, x):\n    update(c, x)\n    pass", "solution": "def add(c, x):\n    return c + x"},
    {"question": "Write it", "starterCode": "def add(c, x):\n    pass", "solution": "def other(c, x):\n    return c + x"},
])
async def test_invalid_ladder_question_is_retryable(monkeypatch, payload):
    monkeypatch.setattr(service, "resolve_available_llm_provider", lambda _: "openai")
    monkeypatch.setattr(service, "llm_provider_available", lambda _: True)
    monkeypatch.setattr(service, "call_llm_json", lambda *args: payload)
    with pytest.raises(service.LadderGenerationError):
        await service.generate_ladder_question(SlidingWindowLadderRequest(
            cardTitle="567. Permutation in String", technique="fixed", rungIndex=0, rep=1,
        ))
