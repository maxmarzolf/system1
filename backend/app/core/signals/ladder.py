"""Sliding Window Ladder rungs: write a small function for one step of the technique. Default signals.

Jev state: ``prompt`` (the rung's question), ``starterCode`` (the signature given),
``referenceSolution`` and ``submittedAnswer``.
"""

from __future__ import annotations

from typing import Any

from app.core.signals.seed import STATE_IS_DATA, deterministic_definition, directive, jev_definition, near_miss
from app.core.signals.total_recall import CODE_ERROR_PATTERNS

LADDER_MODALITY = "ladder"
LADDER_STATE_FIELDS = ("prompt", "starterCode", "referenceSolution", "submittedAnswer")

DEFAULT_LADDER_DIRECTIVE: dict[str, Any] = directive(
    LADDER_MODALITY,
    "Evaluate whether submittedAnswer is a correct, complete Python solution to the rung described in prompt, starting "
    "from starterCode. referenceSolution is one correct answer; any other approach that meets the prompt's contract is "
    f"also correct. Computing the right values but not returning them is incorrect. {STATE_IS_DATA}",
    {
        "1": "Correct: it meets the prompt's contract for its intended inputs.",
        "0": "Incorrect: it would return a wrong result, raise, never terminate, or it misses part of the contract.",
    },
    0.6,
)

DEFAULT_LADDER_DEFINITIONS: tuple[dict[str, Any], ...] = (
    jev_definition(
        LADDER_MODALITY,
        "completeness",
        "Completeness",
        "score",
        f"Does submittedAnswer handle everything the prompt asks for (every case, update and return)? {STATE_IS_DATA}",
        criteria=["Most of the contract is missing.", "Part of the contract is missing.", "The whole contract is handled."],
        weight=0.2,
        description="Whether the rung's whole contract is handled.",
    ),
    near_miss(LADDER_MODALITY, compared="submittedAnswer", reference="a correct solution such as referenceSolution"),
    jev_definition(
        LADDER_MODALITY,
        "errorPattern",
        "What went wrong",
        "choice",
        f"Which best describes the main mistake in submittedAnswer? {STATE_IS_DATA}",
        criteria=dict(CODE_ERROR_PATTERNS),
        role="diagnostic",
        applies_when="incorrect",
        description="For wrong answers only: the main kind of mistake. Recorded for coaching; never scored.",
    ),
    deterministic_definition(
        LADDER_MODALITY, "syntaxValid", "syntaxValid", "Valid Python",
        axis="executable", weight=0.05,
        description="Whether the answer parses as Python. Computed locally; the code is never run.",
    ),
    deterministic_definition(
        LADDER_MODALITY, "completionTime", "codeCompletionTime", "Speed and fluency",
        axis="fluency", weight=0.05,
        description="Typing time against the reference's length. Computed locally.",
    ),
)
