"""The stored evaluation: what every evaluator produces and every reader consumes.

Evaluators build an :class:`Evaluation` (via :func:`build_evaluation` or
:func:`outcome_evaluation`), ``submission_service`` validates and stores it, and
readers load stored JSON back with :meth:`Evaluation.from_stored`. Nothing else
parses ``submission.signals.evaluation`` by hand, so an evaluator can change how it
grades without breaking the overview, history or coaching readers.

``version`` is the schema version of this document. Bump it for a breaking shape
change and teach :meth:`Evaluation.from_stored` to upcast older versions.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any, Protocol

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from app.contracts.coerce import coerce_json_object, score_value

EVALUATION_VERSION = 1
SCORE_AXES = ("overall", "conceptual", "fidelity", "executable", "fluency")
SCORED_STATUSES = frozenset({"pass", "partial", "fail"})
_EVIDENCE_LIMIT = 2


class SignalSpecReference(Protocol):
    """Anything that can name the signal spec it is (recall and MCQ specs both can)."""

    def reference(self) -> dict[str, Any]: ...


def _short_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value[:_EVIDENCE_LIMIT] if str(item).strip()]


class RubricEntry(BaseModel):
    """One graded signal: a dimension or a modifier."""

    model_config = ConfigDict(extra="allow")

    key: str = ""
    label: str = ""
    status: str = ""
    score: float = 0.0
    evidence: list[str] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)

    @field_validator("key", "label", "status", mode="before")
    @classmethod
    def _text(cls, value: Any) -> str:
        return str(value or "").strip()

    @field_validator("score", mode="before")
    @classmethod
    def _score(cls, value: Any) -> float:
        return score_value(value)

    @field_validator("evidence", "missing", mode="before")
    @classmethod
    def _lists(cls, value: Any) -> list[str]:
        return _short_list(value)

    @property
    def scored(self) -> bool:
        return self.status in SCORED_STATUSES


class SpecRef(BaseModel):
    """Which spec graded the submission. Recall specs omit ``modality`` and ``hash``."""

    model_config = ConfigDict(extra="allow")

    algorithm: str = ""
    version: int = 0
    modality: str | None = None
    hash: str | None = None

    @field_validator("version", mode="before")
    @classmethod
    def _version(cls, value: Any) -> int:
        try:
            return int(value or 0)
        except (TypeError, ValueError):
            return 0


class PrimaryFailure(BaseModel):
    model_config = ConfigDict(extra="allow")

    key: str = ""
    label: str = ""
    severity: str = ""
    evidence: list[str] = Field(default_factory=list)

    @field_validator("key", "label", "severity", mode="before")
    @classmethod
    def _text(cls, value: Any) -> str:
        return str(value or "").strip()

    @field_validator("evidence", mode="before")
    @classmethod
    def _lists(cls, value: Any) -> list[str]:
        return _short_list(value)


class Provenance(BaseModel):
    """Who graded it. Evaluators add their own fields (``engine``, ``model``, ``flags``…)."""

    model_config = ConfigDict(extra="allow")

    llmUsed: bool = False
    provider: str = ""
    source: str = ""


def _entries(value: Any) -> dict[str, RubricEntry]:
    entries: dict[str, RubricEntry] = {}
    for key, raw in coerce_json_object(value).items():
        if not isinstance(raw, dict):
            continue
        entry = RubricEntry.model_validate(raw)
        entry.key = entry.key or str(key)
        entry.label = entry.label or str(key).replace("_", " ").title()
        entries[str(key)] = entry
    return entries


class Evaluation(BaseModel):
    """A stored evaluation. Dimension and modifier keys are the referenced spec's signal keys.

    Jev MCQ evaluations also carry ``correctness``, ``signalResults``,
    ``signalSpecSnapshot`` and ``jevTrace``. Any evaluation that called an LLM while grading
    carries ``llmTrace``: each exchange's prompt, payload, reply, usage and timing.
    """

    model_config = ConfigDict(extra="allow", validate_assignment=False)

    version: int = EVALUATION_VERSION
    signalSpec: SpecRef = Field(default_factory=SpecRef)
    verdict: str = "needs-work"
    score: dict[str, float] = Field(default_factory=dict)
    primaryFailure: PrimaryFailure = Field(default_factory=PrimaryFailure)
    dimensions: dict[str, RubricEntry] = Field(default_factory=dict)
    modifiers: dict[str, RubricEntry] = Field(default_factory=dict)
    recommendedAction: str = ""
    feedback: dict[str, Any] = Field(default_factory=dict)
    provenance: Provenance = Field(default_factory=Provenance)
    # Jev MCQ extensions.
    correctness: dict[str, Any] | None = None
    signalResults: dict[str, Any] | None = None
    signalSpecSnapshot: dict[str, Any] | None = None
    jevTrace: list[dict[str, Any]] | None = None
    llmTrace: list[dict[str, Any]] | None = None

    @field_validator("score", mode="before")
    @classmethod
    def _score(cls, value: Any) -> dict[str, float]:
        raw = coerce_json_object(value)
        return {axis: score_value(raw.get(axis)) for axis in SCORE_AXES} | {
            str(key): score_value(item) for key, item in raw.items() if key not in SCORE_AXES
        }

    @field_validator("dimensions", "modifiers", mode="before")
    @classmethod
    def _rubric(cls, value: Any) -> dict[str, RubricEntry]:
        return _entries(value)

    @field_validator("verdict", "recommendedAction", mode="before")
    @classmethod
    def _text(cls, value: Any) -> str:
        return str(value or "").strip()

    @field_validator("feedback", mode="before")
    @classmethod
    def _feedback(cls, value: Any) -> dict[str, Any]:
        return coerce_json_object(value)

    @classmethod
    def from_stored(cls, raw: Any) -> Evaluation | None:
        """Load a stored evaluation (dict or JSON string); ``None`` when absent or unreadable."""
        data = coerce_json_object(raw)
        if not data:
            return None
        try:
            return cls.model_validate(data)
        except ValidationError:
            return None

    def to_stored(self) -> dict[str, Any]:
        """The JSON written to ``submission.signals.evaluation``."""
        return self.model_dump(mode="json", exclude_none=True)

    @property
    def sound(self) -> bool:
        return self.verdict == "sound"

    def entries(self) -> Iterator[tuple[str, RubricEntry]]:
        """Every dimension, then every modifier, in spec order."""
        yield from self.dimensions.items()
        yield from self.modifiers.items()

    def scored_entries(self) -> Iterator[tuple[str, RubricEntry]]:
        """Entries that were graded (pass, partial or fail), skipping not-applicable ones."""
        return ((key, entry) for key, entry in self.entries() if entry.scored)

    def compact(self) -> dict[str, Any]:
        """The grading summary without narrative, provenance or Jev traces."""
        return self.model_dump(
            mode="json",
            exclude_none=True,
            include={"verdict", "signalSpec", "score", "primaryFailure", "dimensions", "modifiers", "recommendedAction"},
        )


def evaluation_feedback(raw: Any) -> dict[str, Any]:
    """The coaching feedback of a stored evaluation, or ``{}``."""
    evaluation = raw if isinstance(raw, Evaluation) else Evaluation.from_stored(raw)
    return evaluation.feedback if evaluation else {}


def compact_evaluation(raw: Any) -> dict[str, Any]:
    """:meth:`Evaluation.compact` for stored JSON; ``{}`` when there is no evaluation."""
    evaluation = Evaluation.from_stored(raw)
    return evaluation.compact() if evaluation else {}


_NARRATIVE_EXCLUDED_KEYS = ("submissionRubric", "llmUsed", "llmProvider", "signals")


def build_evaluation(
    rubric: dict[str, Any],
    spec: SignalSpecReference,
    feedback: dict[str, Any] | None = None,
    *,
    provider: str = "",
    llm_used: bool = False,
    source: str = "assessor-narrator",
) -> Evaluation:
    """An evaluation from a graded rubric (``verdict``, ``score``, ``dimensions``…) and narrative feedback."""
    graded = coerce_json_object(rubric)
    narrative = {key: value for key, value in (feedback or {}).items() if key not in _NARRATIVE_EXCLUDED_KEYS}
    return Evaluation.model_validate({
        "version": EVALUATION_VERSION,
        "signalSpec": spec.reference(),
        "verdict": graded.get("verdict") or "needs-work",
        "score": graded.get("score", {}),
        "primaryFailure": graded.get("primaryFailure", {}),
        "dimensions": graded.get("dimensions", {}),
        "modifiers": graded.get("modifiers", {}),
        "recommendedAction": graded.get("recommendedAction") or "",
        "feedback": narrative,
        "provenance": {"llmUsed": bool(llm_used), "provider": provider if llm_used else "", "source": source},
    })


def outcome_evaluation(
    successful: bool,
    spec: SignalSpecReference,
    *,
    llm_used: bool = False,
    provider: str = "",
    source: str = "deterministic",
) -> Evaluation:
    """An evaluation with only a verdict: full marks when sound, zero when not (no fluency signal)."""
    score = 100.0 if successful else 0.0
    return Evaluation.model_validate({
        "signalSpec": spec.reference(),
        "verdict": "sound" if successful else "needs-work",
        "score": {"overall": score, "conceptual": score, "fidelity": score, "executable": score, "fluency": 0.0},
        "provenance": {"llmUsed": bool(llm_used), "provider": provider if llm_used else "", "source": source},
    })
