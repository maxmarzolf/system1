"""Steps 5 and 6 of the pipeline: decide correctness, interpret signals, band the verdict.

Correctness is decided in this order:

1. a **hard override** (empty, not valid Python, no return) makes it incorrect;
2. a **deterministic** directive lets the modality's own check decide (ghost reps);
3. **Jev's** correctness label decides when Jev answered;
4. otherwise (Jev unavailable) the deterministic check is the **fallback**.

The verdict is then banded: ``sound`` when correct, ``close`` when incorrect with a
``nearMiss`` score at or above the threshold, ``needs-work`` otherwise.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.core.signals import ModalitySignalSpec, SignalResult, applies, skipped
from app.services.evaluation.context import SubmissionContext
from app.services.evaluation.jev import JevExchange

NEAR_MISS_KEY = "nearMiss"


@dataclass(frozen=True)
class Decision:
    successful: bool
    # jev | deterministic | deterministic-override | deterministic-fallback
    source: str
    flags: tuple[str, ...]
    label: str | None = None
    confidence: float | None = None


def decide(context: SubmissionContext, spec: ModalitySignalSpec, exchange: JevExchange, *, low_confidence: float) -> Decision:
    flags = list(context.flags)
    if context.overrides:
        return Decision(False, "deterministic-override", (*flags, "deterministic_override"))
    if spec.correctness.source == "deterministic":
        return Decision(context.deterministic_correct, "deterministic", tuple(flags))
    answer = exchange.correctness
    if exchange.first_pass_error is not None or answer is None:
        return Decision(context.deterministic_correct, "deterministic-fallback", (*flags, "jev_unavailable"))
    label = str(answer.get("choice", ""))
    successful = label == "1"
    raw_confidence = answer.get("confidence")
    confidence = float(raw_confidence) if isinstance(raw_confidence, (int, float)) else None
    if context.deterministic_is_key and successful != context.deterministic_correct:
        flags.append("answer_key_disagreement")
    if confidence is not None and confidence < low_confidence:
        flags.append("low_correctness_confidence")
    return Decision(successful, "jev", tuple(flags), label, confidence)


def interpret_signals(
    spec: ModalitySignalSpec, context: SubmissionContext, exchange: JevExchange, successful: bool
) -> dict[str, SignalResult]:
    """Every plug-in's result: not applicable, unavailable (Jev didn't answer), or interpreted."""
    signal_context = context.signal_context()
    results: dict[str, SignalResult] = {}
    for plugin, _weight in spec.plugins():
        is_jev = plugin.question(signal_context) is not None
        if not applies(plugin, successful):
            results[plugin.key] = skipped(plugin, "not_applicable")
        elif is_jev and exchange.first_pass_error is not None:
            results[plugin.key] = skipped(plugin, "unavailable", exchange.first_pass_error.message)
        elif is_jev and plugin.needs_correctness and exchange.second_pass_error is not None:
            results[plugin.key] = skipped(plugin, "unavailable", exchange.second_pass_error.message)
        else:
            results[plugin.key] = plugin.interpret(exchange.answers.get(plugin.key) if is_jev else None, signal_context, successful)
    return results


def band(successful: bool, results: dict[str, SignalResult], near_miss_threshold: float) -> str:
    if successful:
        return "sound"
    near = results.get(NEAR_MISS_KEY)
    if near is not None and near.status == "scored" and near.score is not None and near.score >= near_miss_threshold:
        return "close"
    return "needs-work"
