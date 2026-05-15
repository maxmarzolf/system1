from __future__ import annotations

from datetime import datetime
from typing import Any, TypedDict


class PracticeHistoryRow(TypedDict):
    attemptId: int
    interactionId: str
    cardId: str
    cardTitle: str
    question: str
    questionType: str
    correctAnswer: str
    userAnswer: str
    accuracy: float
    exact: bool
    elapsedMs: int
    templateMode: str
    supportLayer: str
    liveCoachUsed: bool
    categoryTags: list[str]
    generatedCard: dict[str, Any] | str | None
    submissionFeedback: dict[str, Any] | str | None
    submissionRubric: dict[str, Any] | str | None
    created_at: datetime | None
    liveFeedbackCount: int
    latestLiveFeedback: dict[str, Any] | str | None


class PracticeHistoryEntry(TypedDict):
    attemptId: int
    interactionId: str
    cardId: str
    cardTitle: str
    question: str
    questionType: str
    correctAnswer: str
    userAnswer: str
    accuracy: float
    exact: bool
    elapsedMs: int
    templateMode: str
    supportLayer: str
    liveCoachUsed: bool
    categoryTags: list[str]
    generatedCard: dict[str, Any]
    liveFeedbackCount: int
    latestLiveFeedback: dict[str, Any]
    submissionFeedback: dict[str, Any]
    submissionRubric: dict[str, Any]
    createdAt: str


class ScoreAttemptInsertResult(TypedDict):
    id: int


class QuestionInsertResult(TypedDict):
    id: str


class PatternMethodRow(TypedDict):
    pattern_id: int
    pattern_name: str
    method_id: int | None
    method_name: str | None


class SkillMapOverviewPatternRow(TypedDict):
    pattern_id: int
    pattern_name: str
    method_name: str | None


class SkillMapOverviewGeneratedRow(TypedDict):
    id: str
    title: str
    tags: list[str] | None


class StaticFunctionPracticeRow(TypedDict):
    name: str
    title: str
    difficulty: str
    description: str
    code: str
    tags: list[str] | None
    leetcode_examples: list[str] | str | None
    pattern_slug: str
    pattern_name: str


class SkillMapOverviewAttemptRow(TypedDict):
    tracked_card_id: str
    card_title: str
    category_tags: list[str] | None
    accuracy: float
    created_at: datetime
    template_mode: str
    support_layer: str
    live_coach_used: bool
    submission_rubric: dict[str, Any] | str | None
