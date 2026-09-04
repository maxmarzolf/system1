from __future__ import annotations

from app.core.narrator import narrator_submission_system_prompt
from app.domain.submission_evaluation import canonical_submission_evaluation
from app.domain.template_evaluation import merged_submission_tuning


def test_micro_drill_is_opt_in_by_default() -> None:
    tuning = merged_submission_tuning(None)

    assert tuning["microDrillEnabled"] is False
    prompt = narrator_submission_system_prompt("algorithm", tuning)
    assert "Return microDrill, microDrillExplanation, and microDrillInvariant as empty strings" in prompt


def test_enabled_micro_drill_preserves_correct_work_and_targets_the_mistake() -> None:
    tuning = merged_submission_tuning({"microDrillEnabled": True})

    assert tuning["microDrillEnabled"] is True
    prompt = narrator_submission_system_prompt("algorithm", tuning)
    assert "self-contained reinforcement question" in prompt
    assert "Preserve the structures the learner already got right" in prompt
    assert "blank only the decisions tied to the mistake" in prompt
    assert "three or more underscores" in prompt
    assert "microDrillExplanation" in prompt
    assert "microDrillInvariant" in prompt
    assert "Do not reveal the filled answers" in prompt


def test_micro_drill_guidance_is_preserved_in_submission_feedback() -> None:
    evaluation = canonical_submission_evaluation(
        {"verdict": "needs-work"},
        {
            "microDrill": "Fill the focused blanks.",
            "microDrillExplanation": "This variation practices neighbor bookkeeping.",
            "microDrillInvariant": "Validate and record the neighbor, never the current cell.",
        },
    )

    assert evaluation["feedback"]["microDrill"] == "Fill the focused blanks."
    assert evaluation["feedback"]["microDrillExplanation"] == "This variation practices neighbor bookkeeping."
    assert evaluation["feedback"]["microDrillInvariant"] == "Validate and record the neighbor, never the current cell."
