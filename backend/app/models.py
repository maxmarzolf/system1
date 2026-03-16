from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ─── Enums ───


class GameMode(str, Enum):
    snap_classify = "snap-classify"
    template_hunt = "template-hunt"
    gut_check = "gut-check"
    no_go_trap = "no-go-trap"
    near_miss_duel = "near-miss-duel"
    main_recall = "main-recall"
    multiple_choice = "multiple-choice"
    full_solution = "full-solution"
    typing_race = "typing-race"


# ─── Request schemas ───


class AttemptCreate(BaseModel):
    cardId: str = Field(min_length=1)
    cardTitle: str | None = None
    question: str | None = None
    options: list[dict] | None = None
    correctAnswer: str | None = None
    userAnswer: str | None = None
    mode: GameMode
    correct: bool


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


class ModeStats(BaseModel):
    correct: int = 0
    incorrect: int = 0
    attempts: int = 0
    accuracy: int = 0


class Totals(BaseModel):
    correct: int = 0
    incorrect: int = 0
    attempts: int = 0
    accuracy: int = 0


class DayStats(BaseModel):
    date: str
    correct: int
    incorrect: int
    attempts: int
    accuracy: int


class RecentAttempt(BaseModel):
    cardId: str
    mode: str
    correct: bool
    timestamp: str


class StatsResponse(BaseModel):
    totals: Totals
    byMode: dict[str, ModeStats]
    byDay: list[DayStats]
    recent: list[RecentAttempt]


class AttemptSavedResponse(BaseModel):
    saved: bool = True
    stats: StatsResponse


class TypingSessionSavedResponse(BaseModel):
    saved: bool = True
    sessionId: int


class ActivityDay(BaseModel):
    day: str
    sessions: int
    total_ms: int
    avg_accuracy: float
    avg_wpm: float
    total_chars: int
    correct_count: int
    question_types: str
    category_tags: str


class TypingSummary(BaseModel):
    total_sessions: int
    total_ms: int
    total_chars: int
    avg_accuracy: float
    avg_wpm: float
    total_correct: int
    best_score: int
    best_wpm: int


class TypingActivityResponse(BaseModel):
    activity: list[ActivityDay]
    summary: TypingSummary
    recent: list[dict]
    streak: int


class ScoreAttemptsResponse(BaseModel):
    attempts: list[dict]


class System1SessionCreate(BaseModel):
    mode: GameMode
    questionType: str = ""
    orderType: str = Field(default="shuffled")
    cardCount: int = Field(default=0, ge=0)
    attempts: int = Field(default=0, ge=0)
    correctCount: int = Field(default=0, ge=0)
    accuracy: float = Field(default=0, ge=0, le=100)
    durationMs: int = Field(default=0, ge=0)
    totalScore: int = 0
    avgAutomaticity: float = Field(default=0, ge=0, le=100)
    startedAt: str | None = None
    completedAt: str | None = None


class System1SessionSavedResponse(BaseModel):
    saved: bool = True
    sessionId: int


class System1SessionSummary(BaseModel):
    total_sessions: int = 0
    avg_accuracy: float = 0
    avg_duration_ms: int = 0
    avg_score: float = 0
    best_accuracy: float = 0
    best_score: int = 0


class System1SessionActivityDay(BaseModel):
    date: str
    sessions: int
    avg_accuracy: float
    avg_score: float
    avg_duration_ms: int


class System1SessionModeStats(BaseModel):
    sessions: int = 0
    avg_accuracy: float = 0
    avg_score: float = 0


class System1SessionActivityResponse(BaseModel):
    summary: System1SessionSummary
    byDay: list[System1SessionActivityDay]
    byMode: dict[str, System1SessionModeStats]
    recent: list[dict]


class CoachAttemptFeedbackRequest(BaseModel):
    cardId: str = Field(min_length=1)
    cardTitle: str = ""
    prompt: str = ""
    expectedAnswer: str = ""
    userAnswer: str = ""
    elapsedMs: int = Field(default=0, ge=0)
    accuracy: float = Field(default=0, ge=0, le=100)
    exact: bool = False
    questionType: str = ""
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
    llmUsed: bool = False


class SessionWeakCard(BaseModel):
    cardId: str = Field(min_length=1)
    cardTitle: str = ""
    accuracy: float = Field(default=0, ge=0, le=100)
    elapsedMs: int = Field(default=0, ge=0)


class CoachSessionPlanRequest(BaseModel):
    mode: GameMode = GameMode.main_recall
    questionType: str = ""
    orderType: str = "shuffled"
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
