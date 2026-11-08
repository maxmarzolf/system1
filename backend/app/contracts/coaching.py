"""Request shapes that core engines (generator, assessor, narrator) work on.

They are also API request bodies, so ``app.models`` re-exports them; defining them
here lets core and domain use them without depending on the API layer.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


class GameMode(str, Enum):
    main_recall = "main-recall"


class TemplateMode(str, Enum):
    algorithm = "algorithm"


class SubmissionModality(str, Enum):
    total_recall = "total-recall"
    ghost_rep = "ghost-rep"
    mcq = "mcq"
    microdrill = "microdrill"


class CoachAttemptFeedbackRequest(BaseModel):
    cardId: str = Field(min_length=1)
    cardTitle: str = ""
    prompt: str = ""
    expectedAnswer: str = ""
    userAnswer: str = ""
    elapsedMs: int = Field(default=0, ge=0)
    exact: bool = False
    interactionId: str | None = None
    questionType: str = ""
    skillTags: list[str] = []
    mode: GameMode = GameMode.main_recall
    templateMode: TemplateMode = TemplateMode.algorithm
    submissionTuning: dict[str, Any] = {}
    llmProvider: str = "openai"


class CoachAttemptEvaluationRequest(BaseModel):
    cardTitle: str = ""
    prompt: str = ""
    expectedAnswer: str = ""
    userAnswer: str = ""
    skillTags: list[str] = []
    templateMode: TemplateMode = TemplateMode.algorithm
    submissionTuning: dict[str, Any] = {}
    llmProvider: str = "openai"


class SkillMapNode(BaseModel):
    algorithm: str = Field(min_length=1)
    skills: list[str] = []
    techniques: list[str] = []
    questionTitle: str = ""
    playlistSlug: str = ""


class SkillMapDrillsRequest(BaseModel):
    questionType: str = "skill-map"
    count: int = Field(default=12, ge=1, le=60)
    skillMap: list[SkillMapNode] = []
    templateMode: TemplateMode = TemplateMode.algorithm
    templateTargets: dict[str, dict[str, str]] = Field(default_factory=dict)
    specimenTuning: dict[str, Any] = Field(default_factory=dict)
    llmProvider: str = "openai"


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


class FlowAttemptContext(BaseModel):
    modality: SubmissionModality
    successful: bool = False
    score: float = Field(default=0, ge=0, le=100)
    weakness: str = ""
    question: str = ""


class MultipleChoiceSpecimenFocus(BaseModel):
    sequenceStage: Literal["recall", "ghost", "multiple-choice"] = "multiple-choice"
    focusSummary: str = ""
    missedLines: list[MultipleChoiceSpecimenFocusLine] = Field(default_factory=list)
    phase: Literal["establish", "remediate", "consolidate", "challenge", "mastered"] = "establish"
    proficiency: int = Field(default=0, ge=0, le=100)
    weaknessSummary: str = ""
    recentAttempts: list[FlowAttemptContext] = Field(default_factory=list, max_length=8)


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
