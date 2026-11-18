"""Deterministic signal implementations: computed locally, no Jev question.

A deterministic ``signal_definition`` row names one of these by ``implementation``; the row
sets the key, label, role, axis and weight. The same implementation means the same thing in
every modality. State keys read here:

- every modality: ``elapsed_ms`` comes from the context, not the state;
- code modalities: ``submittedAnswer`` and ``referenceSolution``;
- microdrill: ``template`` and ``expectedBlanks`` as well.
"""

from __future__ import annotations

from collections.abc import Sequence

from app.core import code_checks
from app.core.signals.base import DeterministicSignal, SignalContext
from app.core.signals.registry import register_implementation


def _linear_speed(elapsed_ms: int, fast_ms: int, slow_ms: int) -> float:
    fraction = (max(elapsed_ms, 0) - fast_ms) / max(slow_ms - fast_ms, 1)
    return 100.0 * (1 - min(max(fraction, 0.0), 1.0))


def _completion_time(context: SignalContext, successful: bool) -> tuple[int, float, str]:
    del successful
    return max(context.elapsed_ms, 0), _linear_speed(context.elapsed_ms, 10_000, 90_000), ""


def code_speed_window(reference: str) -> tuple[int, int]:
    """(fast, slow) in ms for typing ``reference`` from memory: 20s + 4s a line, slow at 5×."""
    lines = len([line for line in reference.splitlines() if line.strip()])
    fast = 20_000 + 4_000 * lines
    return fast, fast * 5


def _code_completion_time(context: SignalContext, successful: bool) -> tuple[int, float, str]:
    del successful
    fast, slow = code_speed_window(str(context.state.get("referenceSolution") or ""))
    return max(context.elapsed_ms, 0), _linear_speed(context.elapsed_ms, fast, slow), f"fast ≤ {fast // 1000}s, slow ≥ {slow // 1000}s"


def _syntax_valid(context: SignalContext, successful: bool) -> tuple[bool, float, str]:
    del successful
    valid = code_checks.parses(str(context.state.get("submittedAnswer") or ""))
    return valid, 100.0 if valid else 0.0, "" if valid else "The answer is not valid Python."


def _structural_match(context: SignalContext, successful: bool) -> tuple[bool, float, str]:
    del successful
    reference = str(context.state.get("referenceSolution") or "")
    submitted = str(context.state.get("submittedAnswer") or "")
    if code_checks.structural_match(reference, submitted):
        return True, 100.0, "Same program as the reference, up to names and formatting."
    similarity = code_checks.structural_similarity(reference, submitted)
    return False, similarity * 100, f"{round(similarity * 100)}% similar to the reference."


def _blank_accuracy(context: SignalContext, successful: bool) -> tuple[Sequence[bool] | None, float | None, str]:
    del successful
    template = str(context.state.get("template") or "")
    expected = [str(value) for value in context.state.get("expectedBlanks") or []]
    if not template or not expected:
        return None, None, "No template stored for this drill."
    filled = code_checks.filled_blanks(template, str(context.state.get("submittedAnswer") or ""))
    if filled is None or len(filled) != len(expected):
        return None, 0.0, "The code around the blanks was changed."
    matches = [value == answer.strip() for value, answer in zip(filled, expected, strict=True)]
    return matches, 100.0 * sum(matches) / len(matches), f"{sum(matches)} of {len(matches)} blanks match."


COMPLETION_TIME = register_implementation(DeterministicSignal(
    key="completionTime",
    label="Speed and fluency",
    description="Answer time: 100 at 10s or faster, falling linearly to 0 at 90s.",
    compute=_completion_time,
    role="modifier",
    axis="fluency",
))
CODE_COMPLETION_TIME = register_implementation(DeterministicSignal(
    key="codeCompletionTime",
    label="Speed and fluency",
    description="Typing time against the reference's length: 100 within 20s + 4s per line, 0 at five times that.",
    compute=_code_completion_time,
    role="modifier",
    axis="fluency",
))
SYNTAX_VALID = register_implementation(DeterministicSignal(
    key="syntaxValid",
    label="Valid Python",
    description="100 when the answer parses as Python, otherwise 0. The code is never run.",
    compute=_syntax_valid,
    role="modifier",
    axis="executable",
))
STRUCTURAL_MATCH = register_implementation(DeterministicSignal(
    key="structuralMatch",
    label="Matches the reference",
    description="100 when the answer is the reference program up to names and formatting; otherwise how similar it is.",
    compute=_structural_match,
    role="dimension",
    axis="fidelity",
))
BLANK_ACCURACY = register_implementation(DeterministicSignal(
    key="blankAccuracy",
    label="Blanks filled correctly",
    description="The share of a drill's blanks typed exactly as the stored answers (whitespace ignored).",
    compute=_blank_accuracy,
    role="dimension",
    axis="fidelity",
))
