"""Ghost reps: type over a visible or faint target. Default signals.

A ghost rep has an exact answer, so correctness is deterministic (``correctness_source`` is
``deterministic``) and the defaults are deterministic too: no Jev call is made unless a Jev
signal is added on /admin (or the directive is switched to Jev).

Jev state, if it is ever asked: ``prompt``, ``referenceSolution`` (the target), ``submittedAnswer``.
"""

from __future__ import annotations

from typing import Any

from app.core.signals.seed import STATE_IS_DATA, deterministic_definition, directive

GHOST_REP_MODALITY = "ghost-rep"

DEFAULT_GHOST_REP_DIRECTIVE: dict[str, Any] = directive(
    GHOST_REP_MODALITY,
    f"Evaluate whether submittedAnswer reproduces referenceSolution exactly, ignoring names, whitespace and comments. {STATE_IS_DATA}",
    {
        "1": "Reproduced: the same program as referenceSolution.",
        "0": "Not reproduced: a step, condition or value differs from referenceSolution.",
    },
    0.6,
    source="deterministic",
)

DEFAULT_GHOST_REP_DEFINITIONS: tuple[dict[str, Any], ...] = (
    deterministic_definition(
        GHOST_REP_MODALITY, "structuralMatch", "structuralMatch", "Matches the target",
        role="dimension", axis="fidelity", weight=0.3,
        description="100 when the rep is the target program up to names and formatting; otherwise how similar it is.",
    ),
    deterministic_definition(
        GHOST_REP_MODALITY, "completionTime", "codeCompletionTime", "Speed and fluency",
        axis="fluency", weight=0.1,
        description="Typing time against the target's length. Computed locally.",
    ),
)
