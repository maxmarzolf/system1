from __future__ import annotations

import os

import pytest

from app.core.jev import HttpJevGateway
from app.core.signals import SignalContext
from app.core.signals.mcq import DEFAULT_MCQ_SIGNAL_SPEC
from app.services.evaluators.jev_mcq import correctness_question

STATE = {
    "question": "In a sliding window, when do you advance the left pointer?",
    "answers": [
        {"id": "A", "text": "While the window violates the constraint."},
        {"id": "B", "text": "On every iteration, together with the right pointer."},
        {"id": "C", "text": "Only after the loop ends."},
        {"id": "D", "text": "Never; only the right pointer moves."},
    ],
    "correctAnswer": {"id": "A", "text": "While the window violates the constraint."},
}


@pytest.mark.jev_live
@pytest.mark.asyncio
@pytest.mark.parametrize(("submitted", "expected"), [("A", "1"), ("C", "0")])
async def test_live_jev_grades_the_mcq_correctness_question(submitted: str, expected: str) -> None:
    api_key = os.environ.get("TYPESAFE_API_KEY", "")
    if not api_key:
        pytest.skip("TYPESAFE_API_KEY is not set")
    state = {**STATE, "submittedAnswer": next(a for a in STATE["answers"] if a["id"] == submitted)}
    context = SignalContext(modality="mcq", state=state)
    questions = {"correctness": correctness_question()}
    for plugin, _weight in DEFAULT_MCQ_SIGNAL_SPEC.plugins():
        question = plugin.question(context)
        if question is not None:
            questions[plugin.key] = question
    gateway = HttpJevGateway(api_key=api_key, model=os.environ.get("JEV_MODEL", "jev-1.13.0"))

    response = await gateway.system_one(state, questions)

    assert set(response.answers) == set(questions)
    assert response.answers["correctness"]["choice"] == expected
