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
    submissionFeedback: dict[str, Any]
    submissionRubric: dict[str, Any]
    createdAt: str


class SubmissionInsertResult(TypedDict):
    id: int


class MultipleChoiceProblemInsertResult(TypedDict):
    id: str


class AlgorithmSkillRow(TypedDict):
    algorithm_id: int
    algorithm_name: str
    skill_id: int | None
    skill_name: str | None


class SkillMapOverviewAlgorithmRow(TypedDict):
    algorithm_id: int
    algorithm_name: str
    skill_name: str | None


class SkillMapOverviewGeneratedRow(TypedDict):
    id: str
    title: str
    tags: list[str] | None


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
    technique_slugs: list[str]
    skill_slugs: list[str]


class SkillMapOverviewAttemptRow(TypedDict):
    tracked_card_id: str
    card_title: str
    category_tags: list[str] | None
    question_type: str | None
    accuracy: float
    exact: bool
    created_at: datetime
    template_mode: str
    support_layer: str
    activity_format: str | None
    live_coach_used: bool
    submission_rubric: dict[str, Any] | str | None
