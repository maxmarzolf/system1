from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ─── Enums ───


class GameMode(str, Enum):
    main_recall = "main-recall"


class TemplateMode(str, Enum):
    pseudo = "pseudo"
    skeleton = "skeleton"
    full = "full"


# ─── Request schemas ───


class AttemptCreate(BaseModel):
    cardId: str = Field(min_length=1)
    cardTitle: str | None = None
    question: str | None = None
    questionType: str = ""
    categoryTags: list[str] = []
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
    templateMode: TemplateMode = TemplateMode.full
    liveCoachUsed: bool = False
    coachFeedback: dict[str, Any] | None = None
    submissionRubric: dict[str, Any] | None = None


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
    templateMode: TemplateMode = TemplateMode.full
    enabledTemplateModes: list[TemplateMode] = [TemplateMode.full]
    previousAttempts: list[dict] = []
    liveMode: bool = False
    liveMilestones: dict[str, Any] = {}
    liveCoachTuning: dict[str, Any] = {}
    submissionTuning: dict[str, Any] = {}
    llmProvider: str = "openai"


class CoachAttemptFeedbackResponse(BaseModel):
    diagnosis: str
    primaryFocus: str
    immediateCorrection: str
    keepInMind: str = ""
    affirmation: str = ""
    nextMove: str = ""
    why: str = ""
    microDrill: str
    nextRepTarget: str
    strengths: list[str] = []
    errorTags: list[str] = []
    fullFeedback: str = ""
    correctedVersion: str = ""
    submissionRubric: dict[str, Any] = {}
    llmUsed: bool = False
    llmProvider: str = ""


class CoachAttemptEvaluationRequest(BaseModel):
    expectedAnswer: str = ""
    userAnswer: str = ""
    skillTags: list[str] = []
    templateMode: TemplateMode = TemplateMode.full
    submissionTuning: dict[str, Any] = {}


class CoachAttemptEvaluationResponse(BaseModel):
    accuracy: float = Field(default=0, ge=0, le=100)
    sound: bool = False
    syntaxValid: bool = False


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
    llmProvider: str = "openai"


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
    llmProvider: str = "openai"


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
    templateMode: str = TemplateMode.full.value
    liveCoachUsed: bool = False
    categoryTags: list[str] = []
    generatedCard: dict[str, Any] = {}
    liveFeedbackCount: int = Field(default=0, ge=0)
    latestLiveFeedback: dict[str, Any] = {}
    submissionFeedback: dict[str, Any] = {}
    submissionRubric: dict[str, Any] = {}
    createdAt: str = ""


class CoachPracticeHistoryResponse(BaseModel):
    summary: dict[str, Any] = {}
    entries: list[CoachPracticeHistoryEntry] = []


class SkillMapActivityDay(BaseModel):
    date: str = ""
    count: int = Field(default=0, ge=0)
    inFuture: bool = False


class SkillMapModeActivity(BaseModel):
    windowStart: str = ""
    windowEnd: str = ""
    recentSubmitCount: int = Field(default=0, ge=0)
    lastSevenDaySubmitCount: int = Field(default=0, ge=0)
    activeDays: int = Field(default=0, ge=0)
    currentStreak: int = Field(default=0, ge=0)
    longestStreak: int = Field(default=0, ge=0)
    peakDailyCount: int = Field(default=0, ge=0)
    days: list[SkillMapActivityDay] = []


class SkillMapModeReadiness(BaseModel):
    readiness: float = Field(default=0, ge=0, le=100)
    attemptCount: int = Field(default=0, ge=0)
    successfulAttempts: int = Field(default=0, ge=0)
    avgAccuracy: float = Field(default=0, ge=0, le=100)
    totalCards: int = Field(default=0, ge=0)
    practicedCards: int = Field(default=0, ge=0)
    untouchedCards: int = Field(default=0, ge=0)
    staleCards: int = Field(default=0, ge=0)
    lastSubmittedAt: str = ""
    daysSinceLastSubmit: int | None = Field(default=None, ge=0)
    stale: bool = False
    liveCoachUsedCount: int = Field(default=0, ge=0)
    dimensionSummary: dict[str, Any] = {}
    activity: SkillMapModeActivity = SkillMapModeActivity()


class SkillMapPatternReadiness(BaseModel):
    pattern: str = Field(min_length=1)
    slug: str = Field(min_length=1)
    methods: list[str] = []
    overallReadiness: float = Field(default=0, ge=0, le=100)
    overallAttemptCount: int = Field(default=0, ge=0)
    totalCards: int = Field(default=0, ge=0)
    practicedCards: int = Field(default=0, ge=0)
    untouchedCards: int = Field(default=0, ge=0)
    staleCards: int = Field(default=0, ge=0)
    dimensionSummary: dict[str, Any] = {}
    modes: dict[str, SkillMapModeReadiness] = {}


class SkillMapCardReadiness(BaseModel):
    cardId: str = Field(min_length=1)
    title: str = ""
    pattern: str = ""
    templateMode: str = TemplateMode.full.value
    readiness: float = Field(default=0, ge=0, le=100)
    attemptCount: int = Field(default=0, ge=0)
    daysSinceLastSubmit: int | None = Field(default=None, ge=0)
    stale: bool = False
    dimensionSummary: dict[str, Any] = {}


class SkillMapOverviewResponse(BaseModel):
    summary: dict[str, Any] = {}
    patterns: list[SkillMapPatternReadiness] = []
    reviewQueue: list[SkillMapCardReadiness] = []


class AdminResetPracticeHistoryRequest(BaseModel):
    confirm: str = Field(min_length=1)


class AdminResetPracticeHistoryResponse(BaseModel):
    clearedTables: list[str] = []
    before: dict[str, int] = {}
    after: dict[str, int] = {}
