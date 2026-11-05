"""Signal plug-in contract.

A signal is a self-contained unit: it may contribute one Jev question for a
submission and it interprets its own answer into a ``SignalResult``. Most
signals are declarative ``JevSignal`` entries; ``DeterministicSignal`` covers
signals computed locally (no Jev call).
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

from app.core.jev import JevQuestion, choice, noul, score

SignalRole = Literal["dimension", "modifier", "diagnostic"]
SignalAxis = Literal["fidelity", "executable", "fluency"]
AppliesWhen = Literal["always", "correct", "incorrect"]
SignalStatus = Literal["scored", "not_applicable", "unavailable"]
JevPrimitive = Literal["choice", "score", "noul"]


@dataclass(frozen=True)
class SignalContext:
    """What a signal sees: the Jev state for the submission plus raw facts."""

    modality: str
    state: Mapping[str, Any]
    elapsed_ms: int = 0


@dataclass(frozen=True)
class SignalResult:
    key: str
    label: str
    role: SignalRole
    status: SignalStatus
    raw: Any = None
    score: float | None = None
    confidence: float | None = None
    note: str = ""

    def to_json(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "label": self.label,
            "role": self.role,
            "status": self.status,
            "raw": self.raw,
            "score": self.score,
            "confidence": self.confidence,
            "note": self.note,
        }


class SignalPlugin(Protocol):
    key: str
    label: str
    role: SignalRole
    axis: SignalAxis | None
    applies_when: AppliesWhen
    needs_correctness: bool

    def question(self, context: SignalContext) -> JevQuestion | None: ...

    def interpret(self, answer: Mapping[str, Any] | None, context: SignalContext, successful: bool) -> SignalResult: ...

    def describe(self) -> dict[str, Any]: ...


def applies(plugin: SignalPlugin, successful: bool) -> bool:
    if plugin.applies_when == "correct":
        return successful
    if plugin.applies_when == "incorrect":
        return not successful
    return True


def skipped(plugin: SignalPlugin, status: SignalStatus, note: str = "") -> SignalResult:
    return SignalResult(key=plugin.key, label=plugin.label, role=plugin.role, status=status, note=note)


def _clamp_score(value: float) -> float:
    return round(min(max(value, 0.0), 100.0), 1)


@dataclass(frozen=True)
class JevSignal:
    """A signal answered by one Jev question.

    ``score_map`` turns a Choice label into a 0-100 score; leave it empty for
    diagnostic signals whose answer is a category, not a grade.
    """

    key: str
    label: str
    primitive: JevPrimitive
    instructions: Any
    criteria: Mapping[str, Any] | tuple[Any, ...] | None = None
    role: SignalRole = "dimension"
    axis: SignalAxis | None = None
    applies_when: AppliesWhen = "always"
    needs_correctness: bool = False
    score_map: Mapping[str, float] = field(default_factory=dict)

    def question(self, context: SignalContext) -> JevQuestion:
        del context
        if self.primitive == "choice":
            return choice(self.instructions, dict(self.criteria or {}))
        if self.primitive == "score":
            return score(self.instructions, list(self.criteria or ()))
        return noul(self.instructions)

    def interpret(self, answer: Mapping[str, Any] | None, context: SignalContext, successful: bool) -> SignalResult:
        del context, successful
        if not isinstance(answer, Mapping):
            return skipped(self, "unavailable", "No answer from Jev.")
        confidence = answer.get("confidence")
        confidence = float(confidence) if isinstance(confidence, (int, float)) else None
        raw: Any
        value: float | None
        if self.primitive == "noul":
            raw = float(answer.get("noul", 0.0))
            value = raw * 100
            confidence = abs(raw - 0.5) * 2
        elif self.primitive == "score":
            raw = float(answer.get("score", 0.0))
            top = max(len(self.criteria or ()) - 1, 1)
            value = raw / top * 100
        else:
            raw = str(answer.get("choice", ""))
            value = self.score_map.get(raw) if self.score_map else None
        if self.role == "diagnostic":
            value = None
        return SignalResult(
            key=self.key,
            label=self.label,
            role=self.role,
            status="scored",
            raw=raw,
            score=None if value is None else _clamp_score(value),
            confidence=None if confidence is None else round(confidence, 3),
        )

    def describe(self) -> dict[str, Any]:
        criteria = self.criteria
        return {
            "key": self.key,
            "label": self.label,
            "source": "jev",
            "primitive": self.primitive,
            "instructions": self.instructions,
            "criteria": dict(criteria) if isinstance(criteria, Mapping) else list(criteria or ()),
            "role": self.role,
            "axis": self.axis,
            "appliesWhen": self.applies_when,
            "needsCorrectness": self.needs_correctness,
            "scoreMap": dict(self.score_map),
        }


@dataclass(frozen=True)
class DeterministicSignal:
    """A signal computed locally; ``compute`` returns ``(raw, score_0_100, note)``."""

    key: str
    label: str
    description: str
    compute: Callable[[SignalContext, bool], tuple[Any, float | None, str]]
    role: SignalRole = "modifier"
    axis: SignalAxis | None = None
    applies_when: AppliesWhen = "always"
    needs_correctness: bool = False

    def question(self, context: SignalContext) -> None:
        del context
        return None

    def interpret(self, answer: Mapping[str, Any] | None, context: SignalContext, successful: bool) -> SignalResult:
        del answer
        raw, value, note = self.compute(context, successful)
        return SignalResult(
            key=self.key,
            label=self.label,
            role=self.role,
            status="scored",
            raw=raw,
            score=None if value is None or self.role == "diagnostic" else _clamp_score(value),
            note=note,
        )

    def describe(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "label": self.label,
            "source": "deterministic",
            "description": self.description,
            "role": self.role,
            "axis": self.axis,
            "appliesWhen": self.applies_when,
            "needsCorrectness": self.needs_correctness,
        }
