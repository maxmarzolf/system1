from __future__ import annotations

from datetime import date, datetime
from typing import Any, TypedDict


class PracticeHistoryRow(TypedDict):
    attemptId: int
    sessionId: str
    interactionId: str
    cardId: str
    cardTitle: str
    question: str
    correctAnswer: str
    userAnswer: str
    successful: bool
    signals: dict[str, Any] | str | None
    modality: str
    liveCoachUsed: bool
    categoryTags: list[str]
    generatedCard: dict[str, Any] | str | None
    created_at: datetime | None


class PracticeHistoryEntry(TypedDict):
    attemptId: int
    sessionId: str
    interactionId: str
    cardId: str
    cardTitle: str
    question: str
    correctAnswer: str
    userAnswer: str
    successful: bool
    signals: dict[str, Any]
    modality: str
    liveCoachUsed: bool
    categoryTags: list[str]
    generatedCard: dict[str, Any]
    createdAt: str


class SubmissionInsertResult(TypedDict):
    id: int


class AlgorithmRow(TypedDict):
    algorithm_id: int
    algorithm_slug: str
    algorithm_name: str


class ProblemPracticeRow(TypedDict):
    slug: str
    title: str
    difficulty: str
    description: str
    code: str
    tags: list[str] | None
    leetcode_examples: list[str] | str | None
    algorithm_slug: str
    algorithm_name: str


class SkillMapOverviewAttemptRow(TypedDict):
    tracked_card_id: str
    card_title: str
    category_tags: list[str] | None
    successful: bool
    created_at: datetime
    modality: str | None
    live_coach_used: bool


class CompetencyTerrainRow(TypedDict):
    algorithm: str
    day: date
    observed: bool
    answers: int
    signals: int
    average: float | None
    competency: float
    last_practised: date
    last_average: float
    days_since: int
    standing: str
    free_fall: bool


class CompetencySignalRow(TypedDict):
    algorithm: str
    key: str
    label: str
    average: float
    answers: int
    side: str  # strongest | weakest
    position: int


class CompetencyOverallRow(TypedDict):
    day: date
    competency: float
    algorithms: int
    week_change: float
    trend: str  # improving | maintaining | regressing
