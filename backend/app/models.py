from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ─── Enums ───


class GameMode(str, Enum):
    main_recall = "main-recall"
    multiple_choice = "multiple-choice"
    full_solution = "full-solution"
    typing_race = "typing-race"


# ─── Request schemas ───


class AttemptCreate(BaseModel):
    cardId: str = Field(min_length=1)
    cardTitle: str | None = None
    question: str | None = None
    questionType: str = ""
    categoryTags: list[str] = []
    options: list[dict] | None = None
    correctAnswer: str | None = None
    userAnswer: str | None = None
    mode: GameMode
    correct: bool
    accuracy: float = Field(default=0, ge=0, le=100)
    exact: bool = False
    elapsedMs: int = Field(default=0, ge=0)
    interactionId: str | None = None
    generatedCardId: str | None = None
    generatedCard: dict[str, Any] | None = None
    coachFeedback: dict[str, Any] | None = None


class TypingSessionCreate(BaseModel):
    cardId: str = Field(min_length=1)
    cardTitle: str = ""
    questionType: str = ""
    categoryTags: str = ""
    correct: bool = False
    accuracy: float = Field(default=0, ge=0, le=100)
    wpm: int = Field(default=0, ge=0)
    score: int = Field(default=0, ge=0)
    elapsedMs: int = Field(default=0, ge=0)
    mistakes: int = Field(default=0, ge=0)
    backspaces: int = Field(default=0, ge=0)
    charsTyped: int = Field(default=0, ge=0)


# ─── Response schemas ───


class CoachAttemptFeedbackRequest(BaseModel):
    cardId: str = Field(min_length=1)
    cardTitle: str = ""
    prompt: str = ""
    expectedAnswer: str = ""
    userAnswer: str = ""
    elapsedMs: int = Field(default=0, ge=0)
    accuracy: float = Field(default=0, ge=0, le=100)
    exact: bool = False
    interactionId: str | None = None
    questionType: str = ""
    skillTags: list[str] = []
    mode: GameMode = GameMode.main_recall
    previousAttempts: list[dict] = []
    draftMode: bool = False
    draftMilestones: dict[str, Any] = {}


class CoachAttemptFeedbackResponse(BaseModel):
    diagnosis: str
    primaryFocus: str
    immediateCorrection: str
    microDrill: str
    nextRepTarget: str
    strengths: list[str] = []
    errorTags: list[str] = []
    fullFeedback: str = ""
    correctedVersion: str = ""
    llmUsed: bool = False


class SessionWeakCard(BaseModel):
    cardId: str = Field(min_length=1)
    cardTitle: str = ""
    accuracy: float = Field(default=0, ge=0, le=100)
    elapsedMs: int = Field(default=0, ge=0)


class CoachSessionPlanRequest(BaseModel):
    mode: GameMode = GameMode.main_recall
    questionType: str = ""
    orderType: str = "original"
    attempts: int = Field(default=0, ge=0)
    correctCount: int = Field(default=0, ge=0)
    avgAccuracy: float = Field(default=0, ge=0, le=100)
    avgElapsedMs: int = Field(default=0, ge=0)
    weakestCards: list[SessionWeakCard] = []


class CoachSessionPlanResponse(BaseModel):
    headline: str
    focusTheme: str
    warmup: str
    mainSet: str
    cooldown: str
    note: str
    llmUsed: bool = False


class SkillMapNode(BaseModel):
    pattern: str = Field(min_length=1)
    methods: list[str] = []


class SkillMapDrillCard(BaseModel):
    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    difficulty: str = Field(default="Med.")
    prompt: str = Field(min_length=1)
    solution: str = Field(min_length=1)
    missing: str = Field(min_length=1)
    hint: str = ""
    tags: list[str] = []


class SkillMapDrillsRequest(BaseModel):
    questionType: str = "skill-map"
    count: int = Field(default=12, ge=1, le=20)
    skillMap: list[SkillMapNode] = []


class SkillMapDrillsResponse(BaseModel):
    drills: list[SkillMapDrillCard]
    llmUsed: bool = False


class CoachPracticeHistoryRequest(BaseModel):
    cardId: str = ""
    questionType: str = ""
    skillTags: list[str] = []
    limit: int = Field(default=6, ge=1, le=20)


class CoachPracticeHistoryEntry(BaseModel):
    attemptId: int
    interactionId: str = ""
    cardId: str = ""
    cardTitle: str = ""
    question: str = ""
    correctAnswer: str = ""
    userAnswer: str = ""
    accuracy: float = Field(default=0, ge=0, le=100)
    exact: bool = False
    elapsedMs: int = Field(default=0, ge=0)
    categoryTags: list[str] = []
    generatedCard: dict[str, Any] = {}
    liveFeedbackCount: int = Field(default=0, ge=0)
    latestLiveFeedback: dict[str, Any] = {}
    submissionFeedback: dict[str, Any] = {}
    createdAt: str = ""


class CoachPracticeHistoryResponse(BaseModel):
    summary: dict[str, Any] = {}
    entries: list[CoachPracticeHistoryEntry] = []


class AdminResetPracticeHistoryRequest(BaseModel):
    confirm: str = Field(min_length=1)


class AdminResetPracticeHistoryResponse(BaseModel):
    clearedTables: list[str] = []
    before: dict[str, int] = {}
    after: dict[str, int] = {}
