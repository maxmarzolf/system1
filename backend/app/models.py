from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


# ─── Enums ───


class GameMode(str, Enum):
    main_recall = "main-recall"


class TemplateMode(str, Enum):
    algorithm = "algorithm"


class SupportLayer(str, Enum):
    none = "none"
    ghost_reps = "ghost-reps"


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
    templateMode: TemplateMode = TemplateMode.algorithm
    supportLayer: SupportLayer = SupportLayer.none
    liveCoachUsed: bool = False
    coachFeedback: dict[str, Any] | None = None
    submissionRubric: dict[str, Any] | None = None
    activityFormat: Literal["recall", "multiple-choice", "code-completion"] | None = None
    targetSource: Literal["recall-miss", "algorithm", "skill-map"] | None = None
    targetControl: Literal["user", "system"] | None = None
    formatControl: Literal["user", "system"] | None = None


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
    templateMode: TemplateMode = TemplateMode.algorithm
    enabledTemplateModes: list[TemplateMode] = [TemplateMode.algorithm]
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
    templateMode: TemplateMode = TemplateMode.algorithm
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


class CoachPromptToggleExplanationRequest(BaseModel):
    cardId: str = Field(min_length=1)
    cardTitle: str = ""
    prompt: str = ""
    target: str = ""
    tags: list[str] = []
    llmProvider: str = "openai"


class CoachPromptToggleExplanationResponse(BaseModel):
    plainEnglish: str = ""
    inputExample: str = ""
    outputExample: str = ""
    llmUsed: bool = False


class CoachProviderDefaultResponse(BaseModel):
    provider: str = "openai"


class SkillMapNode(BaseModel):
    algorithm: str = Field(min_length=1)
    skills: list[str] = []
    techniques: list[str] = []
    questionTitle: str = ""
    playlistSlug: str = ""


class PlainEnglishPromptDetail(BaseModel):
    plainEnglish: str = ""
    interviewQuestion: str = ""
    inputExample: str = ""
    outputExample: str = ""
    explanation: str = ""
    brassTacks: str = ""
    leetcodeExamples: list[str] = []


class SkillMapDrillCard(BaseModel):
    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    difficulty: str = Field(default="Med.")
    prompt: str = Field(min_length=1)
    explanation: str = ""
    templatePrompts: dict[str, str] = Field(default_factory=dict)
    templateTargets: dict[str, str] = Field(default_factory=dict)
    solution: str = Field(min_length=1)
    missing: str = Field(min_length=1)
    hint: str = ""
    tags: list[str] = []
    plainEnglishPromptDetail: PlainEnglishPromptDetail = Field(default_factory=PlainEnglishPromptDetail)


class SkillMapDrillsRequest(BaseModel):
    questionType: str = "skill-map"
    count: int = Field(default=12, ge=1, le=60)
    skillMap: list[SkillMapNode] = []
    templateMode: TemplateMode = TemplateMode.algorithm
    templateTargets: dict[str, dict[str, str]] = Field(default_factory=dict)
    specimenTuning: dict[str, Any] = Field(default_factory=dict)
    llmProvider: str = "openai"


class SkillMapDrillsResponse(BaseModel):
    drills: list[SkillMapDrillCard]
    llmUsed: bool = False


class MultipleChoiceChoice(BaseModel):
    id: str = Field(min_length=1)
    text: str = Field(min_length=1)


class MultipleChoiceCard(BaseModel):
    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    algorithm: str = Field(min_length=1)
    skill: str = ""
    difficulty: str = Field(default="Med.")
    question: str = Field(min_length=1)
    choices: list[MultipleChoiceChoice] = Field(min_length=4, max_length=4)
    correctChoiceId: str = Field(min_length=1)
    explanation: str = ""
    tags: list[str] = []


class MultipleChoiceSpecimenFocusLine(BaseModel):
    lineNumber: int = Field(default=1, ge=1)
    expected: str = ""
    actual: str = ""
    status: Literal["mismatch", "missing", "extra"] = "mismatch"


class MultipleChoiceSpecimenFocus(BaseModel):
    sequenceStage: Literal["recall", "ghost", "multiple-choice"] = "multiple-choice"
    focusSummary: str = ""
    missedLines: list[MultipleChoiceSpecimenFocusLine] = Field(default_factory=list)


class MultipleChoiceSpecimenContext(BaseModel):
    cardId: str = ""
    cardTitle: str = ""
    algorithm: str = ""
    prompt: str = ""
    target: str = ""
    tags: list[str] = Field(default_factory=list)
    focus: MultipleChoiceSpecimenFocus | None = None


class MultipleChoiceDrillsRequest(BaseModel):
    questionType: str = "skill-map-mcq"
    count: int = Field(default=12, ge=1, le=30)
    skillMap: list[SkillMapNode] = []
    difficulty: str = Field(default="Med.")
    sourceMode: Literal["algorithm", "skill-map", "card"] = "algorithm"
    flowMode: Literal["random", "progressive"] = "random"
    specimen: MultipleChoiceSpecimenContext | None = None
    llmProvider: str = "openai"


class MultipleChoiceDrillsResponse(BaseModel):
    drills: list[MultipleChoiceCard]
    llmUsed: bool = False


class AdaptiveVariationRequest(BaseModel):
    cardId: str = Field(min_length=1)
    cardTitle: str = ""
    prompt: str = ""
    expectedAnswer: str = Field(min_length=1)
    userAnswer: str = ""
    templateMode: TemplateMode = TemplateMode.algorithm
    skillTags: list[str] = []
    submissionRubric: dict[str, Any] = Field(default_factory=dict)
    specimenTuning: dict[str, Any] = Field(default_factory=dict)
    llmProvider: str = "openai"


class AdaptiveVariationResponse(BaseModel):
    drill: SkillMapDrillCard
    targetDimension: str = ""
    variationReason: str = ""
    llmUsed: bool = False


class SequentialVariationRequest(BaseModel):
    cardId: str = Field(min_length=1)
    cardTitle: str = ""
    prompt: str = ""
    expectedAnswer: str = Field(min_length=1)
    templateMode: TemplateMode = TemplateMode.algorithm
    skillTags: list[str] = []
    specimenTuning: dict[str, Any] = Field(default_factory=dict)
    llmProvider: str = "openai"


class SequentialVariationResponse(BaseModel):
    drill: SkillMapDrillCard
    progressionReason: str = ""
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
    questionType: str = ""
    correctAnswer: str = ""
    userAnswer: str = ""
    accuracy: float = Field(default=0, ge=0, le=100)
    exact: bool = False
    elapsedMs: int = Field(default=0, ge=0)
    templateMode: str = TemplateMode.algorithm.value
    supportLayer: str = SupportLayer.none.value
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


class SkillMapGhostRepSkillSegment(BaseModel):
    skill: str = ""
    slug: str = ""
    count: int = Field(default=0, ge=0)


class SkillMapGhostRepSegment(BaseModel):
    algorithm: str = ""
    slug: str = ""
    workType: str = "ghost-reps"
    count: int = Field(default=0, ge=0)
    skills: list[SkillMapGhostRepSkillSegment] = []


class SkillMapGhostRepActivityDay(BaseModel):
    date: str = ""
    total: int = Field(default=0, ge=0)
    ghostRepCount: int = Field(default=0, ge=0)
    multipleChoiceCount: int = Field(default=0, ge=0)
    totalRecallCount: int = Field(default=0, ge=0)
    segments: list[SkillMapGhostRepSegment] = []


class SkillMapGhostRepAlgorithm(BaseModel):
    algorithm: str = ""
    slug: str = ""
    totalGhostReps: int = Field(default=0, ge=0)
    totalMultipleChoice: int = Field(default=0, ge=0)
    totalPerfectRecalls: int = Field(default=0, ge=0)
    totalWork: int = Field(default=0, ge=0)
    coreCardCount: int = Field(default=0, ge=0)
    daysSinceLastGhostRep: int | None = Field(default=None, ge=0)
    daysSinceLastPractice: int | None = Field(default=None, ge=0)


class SkillMapGhostRepActivity(BaseModel):
    windowStart: str = ""
    windowEnd: str = ""
    totalGhostReps: int = Field(default=0, ge=0)
    totalMultipleChoice: int = Field(default=0, ge=0)
    totalPerfectRecalls: int = Field(default=0, ge=0)
    workCount: int = Field(default=0, ge=0)
    activeDays: int = Field(default=0, ge=0)
    peakDailyCount: int = Field(default=0, ge=0)
    days: list[SkillMapGhostRepActivityDay] = []
    algorithms: list[SkillMapGhostRepAlgorithm] = []

class SkillMapSpacedRepetitionDay(BaseModel):
    date: str = ""
    status: str = "empty"
    label: str = ""


class SkillMapSpacedRepetitionTrack(BaseModel):
    id: str = ""
    label: str = ""
    slug: str = ""
    level: str = "pattern"
    parentSlug: str | None = None
    parentLabel: str | None = None
    coreAlgorithmCount: int = Field(default=0, ge=0)
    requiredGhostReps: int = Field(default=1, ge=1)
    status: str = "not_started"
    statusLabel: str = "Not started"
    stageLabel: str = "Acquire"
    completedSessions: int = Field(default=0, ge=0)
    startedAt: str | None = None
    lastAttemptedAt: str | None = None
    lastCompletedAt: str | None = None
    nextDueAt: str | None = None
    daysUntilDue: int | None = None
    days: list[SkillMapSpacedRepetitionDay] = []


class SkillMapSpacedRepetition(BaseModel):
    today: str = ""
    windowStart: str = ""
    windowEnd: str = ""
    intervals: list[int] = []
    requiredGhostReps: int = Field(default=1, ge=1)
    tracks: list[SkillMapSpacedRepetitionTrack] = []
    queue: list[SkillMapSpacedRepetitionTrack] = []


class SkillMapModeReadiness(BaseModel):
    readiness: float = Field(default=0, ge=0, le=100)
    attemptCount: int = Field(default=0, ge=0)
    ghostRepCount: int = Field(default=0, ge=0)
    unsupportedAttemptCount: int = Field(default=0, ge=0)
    workCount: int = Field(default=0, ge=0)
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


class SkillMapAlgorithmReadiness(BaseModel):
    algorithm: str = Field(min_length=1)
    slug: str = Field(min_length=1)
    skills: list[str] = []
    overallReadiness: float = Field(default=0, ge=0, le=100)
    overallAttemptCount: int = Field(default=0, ge=0)
    ghostRepCount: int = Field(default=0, ge=0)
    unsupportedAttemptCount: int = Field(default=0, ge=0)
    workCount: int = Field(default=0, ge=0)
    totalCards: int = Field(default=0, ge=0)
    practicedCards: int = Field(default=0, ge=0)
    untouchedCards: int = Field(default=0, ge=0)
    staleCards: int = Field(default=0, ge=0)
    dimensionSummary: dict[str, Any] = {}
    modes: dict[str, SkillMapModeReadiness] = {}


class SkillMapCardReadiness(BaseModel):
    cardId: str = Field(min_length=1)
    title: str = ""
    algorithm: str = ""
    templateMode: str = TemplateMode.algorithm.value
    readiness: float = Field(default=0, ge=0, le=100)
    attemptCount: int = Field(default=0, ge=0)
    ghostRepCount: int = Field(default=0, ge=0)
    unsupportedAttemptCount: int = Field(default=0, ge=0)
    workCount: int = Field(default=0, ge=0)
    daysSinceLastSubmit: int | None = Field(default=None, ge=0)
    stale: bool = False
    dimensionSummary: dict[str, Any] = {}


class SkillMapOverviewResponse(BaseModel):
    summary: dict[str, Any] = {}
    algorithms: list[SkillMapAlgorithmReadiness] = []
    reviewQueue: list[SkillMapCardReadiness] = []
    ghostRepActivity: SkillMapGhostRepActivity = SkillMapGhostRepActivity()
    spacedRepetition: SkillMapSpacedRepetition = SkillMapSpacedRepetition()


class AdminResetPracticeHistoryRequest(BaseModel):
    confirm: str = Field(min_length=1)


class AdminResetPracticeHistoryResponse(BaseModel):
    clearedTables: list[str] = []
    before: dict[str, int] = {}
    after: dict[str, int] = {}
