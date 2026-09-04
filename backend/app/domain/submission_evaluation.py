from __future__ import annotations

from typing import Any

from app.submission_rubric import compact_submission_rubric


EVALUATION_VERSION = 1


def canonical_submission_evaluation(
    rubric: dict[str, Any],
    feedback: dict[str, Any] | None = None,
    *,
    provider: str = "",
    llm_used: bool = False,
    source: str = "assessor-narrator",
) -> dict[str, Any]:
    compact_rubric = compact_submission_rubric(rubric)
    narrative = dict(feedback or {})
    narrative.pop("submissionRubric", None)
    narrative.pop("llmUsed", None)
    narrative.pop("llmProvider", None)
    narrative.pop("signals", None)

    return {
        "version": EVALUATION_VERSION,
        "verdict": str(compact_rubric.get("verdict") or "needs-work"),
        "score": compact_rubric.get("score", {}),
        "primaryFailure": compact_rubric.get("primaryFailure", {}),
        "dimensions": compact_rubric.get("dimensions", {}),
        "modifiers": compact_rubric.get("modifiers", {}),
        "recommendedAction": str(compact_rubric.get("recommendedAction") or ""),
        "feedback": narrative,
        "provenance": {
            "llmUsed": bool(llm_used),
            "provider": provider if llm_used else "",
            "source": source,
        },
    }


def outcome_evaluation(
    successful: bool,
    *,
    llm_used: bool = False,
    provider: str = "",
    source: str = "deterministic",
) -> dict[str, Any]:
    verdict = "sound" if successful else "needs-work"
    score = 100.0 if successful else 0.0
    return {
        "version": EVALUATION_VERSION,
        "verdict": verdict,
        "score": {
            "overall": score,
            "conceptual": score,
            "fidelity": score,
            "executable": score,
            "fluency": 0.0,
        },
        "primaryFailure": {},
        "dimensions": {},
        "modifiers": {},
        "recommendedAction": "",
        "feedback": {},
        "provenance": {
            "llmUsed": bool(llm_used),
            "provider": provider if llm_used else "",
            "source": source,
        },
    }


def evaluation_feedback(evaluation: Any) -> dict[str, Any]:
    if not isinstance(evaluation, dict):
        return {}
    feedback = evaluation.get("feedback")
    return feedback if isinstance(feedback, dict) else {}
