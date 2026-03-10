from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


# ─── Enums ───


class GameMode(str, Enum):
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
