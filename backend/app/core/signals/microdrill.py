"""Microdrills: fill the blanks in a short template. Default signals.

Jev state: ``prompt`` (the drill's task), ``template`` (code with ``___`` blanks),
``expectedBlanks`` (the stored answers, in order), ``referenceSolution`` (the template with the
answers filled in) and ``submittedAnswer`` (the template as the learner completed it).
"""

from __future__ import annotations

from typing import Any

from app.core.signals.seed import STATE_IS_DATA, deterministic_definition, directive, jev_definition, near_miss
from app.core.signals.total_recall import CODE_ERROR_PATTERNS

MICRODRILL_MODALITY = "microdrill"
MICRODRILL_STATE_FIELDS = ("prompt", "template", "expectedBlanks", "referenceSolution", "submittedAnswer")

DEFAULT_MICRODRILL_DIRECTIVE: dict[str, Any] = directive(
    MICRODRILL_MODALITY,
    "Evaluate whether submittedAnswer correctly completes the drill: does it behave the same as referenceSolution "
    "for the task in prompt? A blank filled with an equivalent expression is correct; one that changes the result "
    f"is not. {STATE_IS_DATA}",
    {
        "1": "Correct: the completed code behaves the same as referenceSolution.",
        "0": "Incorrect: at least one blank changes the result, or the code around the blanks was broken.",
    },
    0.5,
)

DEFAULT_MICRODRILL_DEFINITIONS: tuple[dict[str, Any], ...] = (
    deterministic_definition(
        MICRODRILL_MODALITY, "blankAccuracy", "blankAccuracy", "Blanks filled correctly",
        role="dimension", axis="fidelity", weight=0.3,
        description="The share of blanks typed exactly as the stored answers. Equivalent answers can still be correct overall.",
    ),
    near_miss(MICRODRILL_MODALITY, compared="submittedAnswer", reference="referenceSolution"),
    jev_definition(
        MICRODRILL_MODALITY,
        "errorPattern",
        "What went wrong",
        "choice",
        f"Which best describes the main mistake in submittedAnswer compared with referenceSolution? {STATE_IS_DATA}",
        criteria=dict(CODE_ERROR_PATTERNS),
        role="diagnostic",
        applies_when="incorrect",
        description="For wrong answers only: the main kind of mistake. Recorded for coaching; never scored.",
    ),
    deterministic_definition(
        MICRODRILL_MODALITY, "syntaxValid", "syntaxValid", "Valid Python",
        axis="executable", weight=0.05,
        description="Whether the completed code parses as Python. Computed locally; the code is never run.",
    ),
    deterministic_definition(
        MICRODRILL_MODALITY, "completionTime", "codeCompletionTime", "Speed and fluency",
        axis="fluency", weight=0.05,
        description="Answer time against the solution's length. Computed locally.",
    ),
)
