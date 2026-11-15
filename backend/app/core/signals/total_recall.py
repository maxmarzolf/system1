"""Total recall: type a whole solution from memory. Default signals.

Jev state: ``prompt``, ``referenceSolution``, ``submittedAnswer``.

The correctness wording is the one ``backend/scripts/jev_recall_calibration.py`` measured
(87/87 on constructed answers). The per-algorithm signals are the ones the old LLM Assessor
scored (formerly ``core/signal_catalog.py``), now algorithm-scoped rows that /admin can edit.
"""

from __future__ import annotations

from typing import Any

from app.core.signals.seed import STATE_IS_DATA, deterministic_definition, directive, jev_definition, near_miss

TOTAL_RECALL_MODALITY = "total-recall"

CODE_ERROR_PATTERNS = {
    "missing_step": "A required step is missing.",
    "wrong_boundary": "A bound, index or range is off (start, end, inclusive/exclusive).",
    "wrong_condition": "A loop or branch condition is wrong.",
    "wrong_update": "State, pointers or accumulators are updated wrongly or in the wrong order.",
    "wrong_return": "Returns the wrong value, or returns at the wrong time.",
    "wrong_pattern": "Uses a different algorithm or approach than the reference.",
    "incomplete": "The answer stops partway or is mostly missing.",
    "other": "None of the above.",
}

DEFAULT_TOTAL_RECALL_DIRECTIVE: dict[str, Any] = directive(
    TOTAL_RECALL_MODALITY,
    "Evaluate whether submittedAnswer is a correct, complete Python implementation of the same algorithm as "
    "referenceSolution, for the problem described in prompt. Variable names, formatting, comments and "
    "equivalent rewrites do not matter; behaviour does. Check the return path: computing the right values but not "
    f"returning them, or returning the wrong variable, is incorrect. {STATE_IS_DATA}",
    {
        "1": "Correct: for the problem's intended inputs it returns the same results as referenceSolution, using a valid approach.",
        "0": "Incorrect: it would return a wrong result, raise, never terminate, or it is missing required steps.",
    },
    0.4,
)


def _code(key: str, label: str, primitive: str, instructions: str, **fields: Any) -> dict[str, Any]:
    return jev_definition(TOTAL_RECALL_MODALITY, key, label, primitive, instructions, **fields)


THREE_LEVELS = ["Missing or wrong.", "Present, but flawed.", "Present and right."]


def _scoped(algorithm: str, key: str, label: str, question: str, weight: float, axis: str | None = None) -> dict[str, Any]:
    """An algorithm-specific step, scored Missing / Flawed / Right against the reference."""
    return _code(
        key,
        label,
        "score",
        f"Compare submittedAnswer with referenceSolution. {question} {STATE_IS_DATA}",
        criteria=list(THREE_LEVELS),
        scope=algorithm,
        weight=weight,
        axis=axis,
        description=f"{algorithm}: {question}",
    )


GENERAL_DEFINITIONS: tuple[dict[str, Any], ...] = (
    _code(
        "structure",
        "Solution structure",
        "score",
        f"How closely does the overall shape of submittedAnswer match referenceSolution's algorithm? {STATE_IS_DATA}",
        criteria=[
            "Unrecognizable: a different idea entirely, or no real attempt.",
            "Partial: the right idea, but a major step or the loop structure is missing or wrong.",
            "Matches: the same steps in the same structure (names and formatting may differ).",
        ],
        weight=0.15,
        description="Whether the answer has the reference's overall shape.",
    ),
    _code(
        "completeness",
        "Completeness",
        "score",
        f"Are all of referenceSolution's required steps present in submittedAnswer, from setup through the return path? {STATE_IS_DATA}",
        criteria=["Most required steps are missing.", "Some required steps are missing.", "Every required step is present."],
        weight=0.15,
        description="Whether every required step is present, including the return path.",
    ),
    _code(
        "patternFidelity",
        "Pattern fidelity",
        "noul",
        f"Does submittedAnswer use the same algorithm pattern as referenceSolution, rather than a different approach? {STATE_IS_DATA}",
        axis="fidelity",
        weight=0.1,
        description="Whether the answer uses the intended pattern rather than a workaround. Feeds the fidelity axis.",
    ),
    near_miss(TOTAL_RECALL_MODALITY, compared="submittedAnswer", reference="referenceSolution"),
    _code(
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
        TOTAL_RECALL_MODALITY, "syntaxValid", "syntaxValid", "Valid Python",
        axis="executable", weight=0.05,
        description="Whether the answer parses as Python. Computed locally; the code is never run.",
    ),
    deterministic_definition(
        TOTAL_RECALL_MODALITY, "completionTime", "codeCompletionTime", "Speed and fluency",
        axis="fluency", weight=0.05,
        description="Typing time against the reference's length. Computed locally.",
    ),
)

ALGORITHM_DEFINITIONS: tuple[dict[str, Any], ...] = (
    _scoped("sliding-window", "windowState", "Window state", "Are the left boundary, window contents, and best answer initialized?", 0.15),
    _scoped("sliding-window", "expandStep", "Expand step", "Does the right edge advance once per element and add it to the window?", 0.15),
    _scoped("sliding-window", "windowRepair", "Window repair", "While the window is invalid, does it remove the left element and advance left?", 0.25, "fidelity"),
    _scoped("sliding-window", "answerUpdate", "Valid-window scoring", "Is the best answer updated only from a valid window, and returned?", 0.1),
    _scoped("two-pointers", "pointerSetup", "Pointer setup", "Are both pointers initialized at the right ends or offsets?", 0.15),
    _scoped("two-pointers", "scanLoop", "Pointer scan loop", "Does the loop run while the pointers have not crossed?", 0.15),
    _scoped("two-pointers", "comparisonRule", "Comparison rule", "Does each iteration compare the pointed values against the goal?", 0.2),
    _scoped("two-pointers", "pointerMovement", "Pointer movement", "Does exactly the correct pointer move based on the comparison?", 0.15, "fidelity"),
    _scoped("binary-search", "searchBounds", "Interval setup", "Are the low and high bounds initialized to cover the whole search space?", 0.15),
    _scoped("binary-search", "loopCondition", "Search loop", "Does the loop condition match the interval convention (closed vs half-open)?", 0.15),
    _scoped("binary-search", "midpoint", "Midpoint step", "Is the midpoint computed inside the loop without overflow-style mistakes?", 0.1),
    _scoped("binary-search", "boundUpdate", "Bound update", "Does the comparison discard the correct half and always shrink the interval?", 0.25, "fidelity"),
    _scoped("dynamic-programming", "stateDefinition", "State definition", "Is there a table or memo whose entries have a clear subproblem meaning?", 0.15),
    _scoped("dynamic-programming", "baseCase", "Base case", "Are the base cases set before any transition reads them?", 0.15),
    _scoped("dynamic-programming", "fillOrder", "Fill order", "Are states computed in an order where dependencies are already solved?", 0.1),
    _scoped("dynamic-programming", "transition", "Transition update", "Does each state combine earlier states with the correct recurrence?", 0.25, "fidelity"),
)

DEFAULT_TOTAL_RECALL_DEFINITIONS: tuple[dict[str, Any], ...] = GENERAL_DEFINITIONS + ALGORITHM_DEFINITIONS
