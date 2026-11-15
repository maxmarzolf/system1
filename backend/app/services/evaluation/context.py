"""Step 1 of the pipeline: what the server trusts about a submission.

A :class:`ContextBuilder` per modality loads the stored item the answer is for (MCQ problem,
recall problem, generated exercise) and returns a :class:`SubmissionContext`: the Jev state, the
record to persist, and the modality's own deterministic verdict, which decides when the
directive says so (ghost reps) or when Jev is unavailable.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

from app.contracts.submission import SubmissionRecord
from app.core.signals import SignalContext
from app.models import AttemptCreate


class SubmissionContextError(ValueError):
    """The submission can't be graded as sent (unknown item, missing ids). Becomes a 422."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class SubmissionContext:
    modality: str
    algorithm_slug: str
    # Everything Jev is asked about this submission; every question reads the same state.
    state: dict[str, Any]
    elapsed_ms: int
    record: SubmissionRecord
    # The modality's own verdict: an answer key (MCQ), an exact match (ghost, code fallback).
    deterministic_correct: bool
    # True when deterministic_correct is an answer key, so disagreeing with Jev is worth a flag.
    deterministic_is_key: bool = False
    # Reasons the answer is incorrect whatever Jev says (code_checks.OVERRIDE_REASONS keys).
    overrides: tuple[str, ...] = ()
    # Facts about how the context was built, e.g. reference_from_client.
    flags: tuple[str, ...] = field(default_factory=tuple)

    def signal_context(self) -> SignalContext:
        return SignalContext(modality=self.modality, state=self.state, elapsed_ms=self.elapsed_ms)


class ContextBuilder(Protocol):
    modality: str

    async def build(self, body: AttemptCreate) -> SubmissionContext: ...
