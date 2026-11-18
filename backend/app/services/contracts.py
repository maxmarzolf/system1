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
	algorithm: str
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


class SkillMapGhostRepSegment(TypedDict):
	algorithm: str
	slug: str
	workType: str
	count: int


class SkillMapGhostRepActivityDay(TypedDict):
	date: str
	total: int
	ghostRepCount: int
	multipleChoiceCount: int
	totalRecallCount: int
	segments: list[SkillMapGhostRepSegment]


class SkillMapGhostRepActivity(TypedDict):
	windowStart: str
	windowEnd: str
	totalGhostReps: int
	totalMultipleChoice: int
	totalPerfectRecalls: int
	workCount: int
	activeDays: int
	peakDailyCount: int
	days: list[SkillMapGhostRepActivityDay]

class SkillMapGridAlgorithm(TypedDict):
	algorithm: str
	slug: str


class SkillMapOverviewPayload(TypedDict):
	algorithms: list[SkillMapGridAlgorithm]
	ghostRepActivity: SkillMapGhostRepActivity

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
	llmUsed: bool
	llmProvider: str
	signals: dict[str, Any]

PersistSkillMapDrills: TypeAlias = Callable[[list[SkillMapDrillPayload], bool, SkillMapProgressSummary], Awaitable[None]]
# The cards, then each card's LLM exchanges (prompt, payload, reply, usage, timing), in order.
PersistGeneratedQuestions: TypeAlias = Callable[
	[list[MultipleChoiceQuestionPayload], list[list[dict[str, Any]]]],
	Awaitable[list[MultipleChoiceQuestionPayload | None] | None],
]
