"""Grading settings the evaluation pipeline reads on every submission.

Defaults live here; /admin can override them (stored server-side), so a change applies to the
next submission.
"""

from __future__ import annotations

from dataclasses import dataclass, field

DEFAULT_FEEDBACK_MODALITIES = frozenset({"total-recall", "microdrill", "ladder"})


@dataclass(frozen=True)
class GradingSettings:
    # Modalities that get written feedback (an LLM call after Jev grades; it never re-grades).
    feedback_modalities: frozenset[str] = field(default_factory=lambda: DEFAULT_FEEDBACK_MODALITIES)
    # A wrong answer whose nearMiss score is at least this is "close" rather than "needs work".
    # nearMiss has three levels (Far 0, Plausible 50, Near 100); Jev can answer in between.
    near_miss_threshold: float = 75.0
    # Jev correctness below this confidence adds the low_correctness_confidence flag.
    low_confidence_threshold: float = 0.6


async def grading_settings() -> GradingSettings:
    return GradingSettings()
