from __future__ import annotations

import os

import pytest

from app.config import settings
from app.core.jev import HttpJevGateway
from app.core.signals import CORRECTNESS_QUESTION_ID, SignalContext
from app.core.signals.mcq import default_mcq_spec

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
    api_key = os.environ.get("TYPESAFE_API_KEY", "") or settings.typesafe_api_key
    if not api_key:
        pytest.skip("TYPESAFE_API_KEY is not set")
    state = {**STATE, "submittedAnswer": next(a for a in STATE["answers"] if a["id"] == submitted)}
    context = SignalContext(modality="mcq", state=state)
    spec = default_mcq_spec()
    questions = {CORRECTNESS_QUESTION_ID: spec.correctness.question()}
    for plugin, _weight in spec.plugins():
        question = plugin.question(context)
        if question is not None:
            questions[plugin.key] = question
    gateway = HttpJevGateway(api_key=api_key, model=settings.jev_model, base_url=settings.typesafe_base_url)

    response = await gateway.system_one(state, questions)

    assert set(response.answers) == set(questions)
    assert response.answers[CORRECTNESS_QUESTION_ID]["choice"] == expected
