from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any, TypeAlias, TypedDict

from app.domain.coach_context import (
	AttemptHistoryEntry,
	AttemptHistorySummary,
	PatternProgressSummary,
	SkillMapProgressSummary as DomainSkillMapProgressSummary,
)


class SkillMapDrillPayload(TypedDict, total=False):
	id: str
	questionType: str
	title: str
	difficulty: str
	prompt: str
	solution: str
	missing: str
	hint: str
	tags: list[str]
	explanation: str


class SkillMapCardGenerationContext(TypedDict):
	llmUsed: bool
	historySummary: dict[str, Any]
	patternProgress: PatternProgressSummary
	explanation: str


class MultipleChoiceChoicePayload(TypedDict):
	id: str
	text: str


class MultipleChoiceQuestionPayload(TypedDict, total=False):
	id: str
	title: str
	pattern: str
	difficulty: str
	question: str
	choices: list[MultipleChoiceChoicePayload]
	correctChoiceId: str
	explanation: str
	tags: list[str]

HistoryEntry: TypeAlias = AttemptHistoryEntry


HistorySummary: TypeAlias = AttemptHistorySummary


SkillMapProgressSummary: TypeAlias = DomainSkillMapProgressSummary


class AttemptSaveResult(TypedDict):
	saved: bool
	attemptId: int | None


class SkillMapModeActivityDay(TypedDict):
	date: str
	count: int
	inFuture: bool


class SkillMapModeActivity(TypedDict):
	windowStart: str
	windowEnd: str
	recentSubmitCount: int
	lastSevenDaySubmitCount: int
	activeDays: int
	currentStreak: int
	longestStreak: int
	peakDailyCount: int
	days: list[SkillMapModeActivityDay]


class SkillMapModeSummary(TypedDict, total=False):
	readiness: float
	attemptCount: int
	daysSinceLastSubmit: int | None
	stale: bool
	ghostRepCount: int
	unsupportedAttemptCount: int
	workCount: int
	totalCards: int
	practicedCards: int
	untouchedCards: int
	staleCards: int
	dimensionSummary: dict[str, Any]
	activity: SkillMapModeActivity


class SkillMapPatternSummary(TypedDict):
	pattern: str
	slug: str
	methods: list[str]
	overallReadiness: float
	overallAttemptCount: int
	ghostRepCount: int
	unsupportedAttemptCount: int
	workCount: int
	totalCards: int
	practicedCards: int
	untouchedCards: int
	staleCards: int
	dimensionSummary: dict[str, Any]
	modes: dict[str, SkillMapModeSummary]


class SkillMapReviewQueueItem(TypedDict):
	cardId: str
	title: str
	pattern: str
	templateMode: str
	readiness: float
	attemptCount: int
	ghostRepCount: int
	unsupportedAttemptCount: int
	workCount: int
	daysSinceLastSubmit: int | None
	stale: bool
	dimensionSummary: dict[str, Any]


class SkillMapGhostRepMethodSegment(TypedDict):
	method: str
	slug: str
	count: int


class SkillMapGhostRepSegment(TypedDict):
	pattern: str
	slug: str
	workType: str
	count: int
	methods: list[SkillMapGhostRepMethodSegment]


class SkillMapGhostRepActivityDay(TypedDict):
	date: str
	total: int
	ghostRepCount: int
	multipleChoiceCount: int
	segments: list[SkillMapGhostRepSegment]


class SkillMapGhostRepPattern(TypedDict):
	pattern: str
	slug: str
	totalGhostReps: int
	totalMultipleChoice: int
	totalWork: int
	daysSinceLastGhostRep: int | None
	daysSinceLastPractice: int | None


class SkillMapGhostRepActivity(TypedDict):
	windowStart: str
	windowEnd: str
	totalGhostReps: int
	totalMultipleChoice: int
	workCount: int
	activeDays: int
	peakDailyCount: int
	days: list[SkillMapGhostRepActivityDay]
	patterns: list[SkillMapGhostRepPattern]


class SkillMapSpacedRepetitionDay(TypedDict):
	date: str
	status: str
	label: str


class SkillMapSpacedRepetitionTrack(TypedDict):
	id: str
	label: str
	slug: str
	level: str
	parentSlug: str | None
	parentLabel: str | None
	coreAlgorithmCount: int
	requiredGhostReps: int
	status: str
	statusLabel: str
	stageLabel: str
	completedSessions: int
	startedAt: str | None
	lastAttemptedAt: str | None
	lastCompletedAt: str | None
	nextDueAt: str | None
	daysUntilDue: int | None
	days: list[SkillMapSpacedRepetitionDay]


class SkillMapSpacedRepetitionPayload(TypedDict):
	today: str
	windowStart: str
	windowEnd: str
	intervals: list[int]
	requiredGhostReps: int
	tracks: list[SkillMapSpacedRepetitionTrack]
	queue: list[SkillMapSpacedRepetitionTrack]


class SkillMapOverviewSummary(TypedDict):
	totalGeneratedCards: int
	attemptedCards: int
	untouchedCards: int
	staleCards: int
	ghostRepCount: int
	unsupportedAttemptCount: int
	workCount: int
	patternsStarted: int
	patternsUntouched: int
	avgPatternReadiness: float
	modeOrder: list[str]
	successThreshold: int
	staleAfterDays: int


class SkillMapOverviewPayload(TypedDict):
	summary: SkillMapOverviewSummary
	patterns: list[SkillMapPatternSummary]
	reviewQueue: list[SkillMapReviewQueueItem]
	ghostRepActivity: SkillMapGhostRepActivity
	spacedRepetition: SkillMapSpacedRepetitionPayload

class FeedbackPayload(TypedDict, total=False):
	diagnosis: str
	primaryFocus: str
	immediateCorrection: str
	keepInMind: str
	affirmation: str
	nextMove: str
	why: str
	microDrill: str
	nextRepTarget: str
	strengths: list[str]
	errorTags: list[str]
	fullFeedback: str
	correctedVersion: str
	submissionRubric: dict[str, Any]
	llmUsed: bool
	llmProvider: str
	signals: dict[str, Any]

PersistSkillMapDrills: TypeAlias = Callable[[list[SkillMapDrillPayload], bool, SkillMapProgressSummary], Awaitable[None]]
PersistGeneratedQuestions: TypeAlias = Callable[[list[MultipleChoiceQuestionPayload]], Awaitable[None]]
