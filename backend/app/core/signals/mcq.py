"""MCQ signal defaults.

The live MCQ signals are ``signal_definition`` rows edited on /admin. The
definitions below seed an empty database once (insert-if-missing) and serve
as the fallback spec in tests. Every Jev question reads the state
``question``, ``answers``, ``correctAnswer`` and ``submittedAnswer``.
"""

from __future__ import annotations

from typing import Any

from app.core.signals.definitions import build_spec
from app.core.signals.deterministic import COMPLETION_TIME
from app.core.signals.seed import GENERAL_SCOPE, STATE_IS_DATA, deterministic_definition, directive, jev_definition
from app.core.signals.spec import ModalitySignalSpec

MCQ_MODALITY = "mcq"
DEFAULT_MCQ_ALGORITHM = "default"
MCQ_STATE_FIELDS = ("question", "answers", "correctAnswer", "submittedAnswer")

__all__ = [
    "COMPLETION_TIME", "DEFAULT_MCQ_ALGORITHM", "DEFAULT_MCQ_DEFINITIONS", "DEFAULT_MCQ_DIRECTIVE", "GENERAL_SCOPE",
    "MCQ_MODALITY", "MCQ_STATE_FIELDS", "STATE_IS_DATA", "default_mcq_spec",
]

DEFAULT_MCQ_DIRECTIVE: dict[str, Any] = directive(
    MCQ_MODALITY,
    "Evaluate whether the person chose the correct answer to the multiple-choice question: "
    f"is submittedAnswer the same choice as correctAnswer? {STATE_IS_DATA}",
    {
        "1": "The user answered correctly: submittedAnswer is the same choice as correctAnswer.",
        "0": "The user answered incorrectly: submittedAnswer is a different choice than correctAnswer.",
    },
    0.6,
)


def _jev(key: str, label: str, primitive: str, instructions: str, **fields: Any) -> dict[str, Any]:
    return jev_definition(MCQ_MODALITY, key, label, primitive, instructions, **fields)


DEFAULT_MCQ_DEFINITIONS: tuple[dict[str, Any], ...] = (
    _jev(
        "conceptRecognition",
        "Concept recognition",
        "noul",
        "Does submittedAnswer show that the person recognized the core algorithm concept "
        f"or invariant the question is testing? {STATE_IS_DATA}",
        axis="fidelity",
        weight=0.25,
        description="Whether the chosen answer shows the person recognized the core concept the question tests, even when the pick is wrong. Feeds the fidelity axis.",
    ),
    _jev(
        "nearMiss",
        "Near miss",
        "score",
        f"How close is submittedAnswer to correctAnswer in the reasoning it reflects? {STATE_IS_DATA}",
        criteria=[
            "Far: the submitted choice reflects a different idea entirely.",
            "Plausible: the submitted choice shares the right approach but gets a key step wrong.",
            "Near: the submitted choice differs from the correct answer only in a small detail.",
        ],
        applies_when="incorrect",
        weight=0.1,
        description="For wrong answers only: how close the pick was to the right reasoning, so near misses score above unrelated picks.",
    ),
    _jev(
        "distractorMisconception",
        "Misconception behind the wrong choice",
        "choice",
        "Which misconception best explains why someone would choose submittedAnswer "
        f"instead of correctAnswer? {STATE_IS_DATA}",
        criteria={
            "off_by_one": "Boundary or index errors: wrong start, end, or inclusive/exclusive range.",
            "wrong_invariant": "Misunderstands what the algorithm's state or invariant represents.",
            "wrong_update": "Updates state, pointers, or bounds in the wrong order or direction.",
            "wrong_termination": "Wrong loop condition or stopping rule.",
            "wrong_complexity": "Misjudges time or space complexity.",
            "misread_question": "Answers a different question than the one asked.",
            "other": "None of the above explains the choice.",
        },
        role="diagnostic",
        applies_when="incorrect",
        description="For wrong answers only: the most likely misconception behind the pick. Recorded for coaching and analytics; never scored.",
    ),
    deterministic_definition(
        MCQ_MODALITY,
        "completionTime",
        "completionTime",
        "Speed and fluency",
        description="Answer time: 100 at 10s or faster, falling linearly to 0 at 90s. Computed locally; no Jev call.",
        axis="fluency",
        weight=0.05,
    ),
)


def default_mcq_spec(algorithm: str = DEFAULT_MCQ_ALGORITHM) -> ModalitySignalSpec:
    """The seed spec, built without a database (tests and the live smoke test)."""
    return build_spec(
        algorithm=algorithm,
        modality=MCQ_MODALITY,
        directive=DEFAULT_MCQ_DIRECTIVE,
        definitions=list(DEFAULT_MCQ_DEFINITIONS),
    )
