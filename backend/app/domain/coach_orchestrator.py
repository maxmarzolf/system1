from __future__ import annotations

from typing import Any

from app.domain.coach_context import summarize_attempt_history


def build_feedback_context(history_entries: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    return history_entries, summarize_attempt_history(history_entries)
