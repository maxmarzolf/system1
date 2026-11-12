"""Response schemas for endpoints that used to return untyped dicts.

Every route declares a ``response_model``, so the OpenAPI document describes every
payload and the frontend types are generated from it (``npm run gen:api``).
Models allow extra fields so a new field from a service is passed through rather
than silently dropped; declare it here to make it part of the contract.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.contracts.evaluation import Evaluation


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="allow")


class HealthResponse(ApiModel):
    ok: bool


# ─── Attempts and history ───


class AttemptSubmitResponse(ApiModel):
    saved: bool
    attemptId: int | None = None
    successful: bool
    evaluation: Evaluation
    feedbackUnavailable: dict[str, Any] | None = None


class HistoryChoice(ApiModel):
    id: str
    text: str
    correct: bool


class HistoryAlgorithm(ApiModel):
    slug: str
    algorithm: str


class HistorySubmission(ApiModel):
    id: int
    createdAt: str
    modality: str
    title: str
    question: str
    choices: list[HistoryChoice]
    userAnswer: str
    correctAnswer: str
    successful: bool
    elapsedMs: int
    algorithms: list[HistoryAlgorithm]
    # The stored evaluation exactly as saved (see app.contracts.evaluation); {} when none.
    evaluation: dict[str, Any]
    flow: dict[str, Any]
    # The LLM exchanges that generated the MCQ (prompt, payload, reply, usage, timing); [] otherwise.
    generationTrace: list[dict[str, Any]] = []


class HistoryDayResponse(ApiModel):
    date: str
    submissions: list[HistorySubmission]


class SignalHistorySignal(ApiModel):
    key: str
    label: str
    count: int


class SignalHistoryPoint(ApiModel):
    submission: int
    createdAt: str
    date: str
    signal: str
    score: float
    title: str
    modality: str
    algorithm: str


class SignalHistoryResponse(ApiModel):
    signals: list[SignalHistorySignal]
    points: list[SignalHistoryPoint]


# ─── Catalog ───


class PlaylistQuestion(ApiModel):
    title: str
    coreShape: str
    methods: list[str]


class PlaylistCatalogEntry(ApiModel):
    slug: str
    title: str
    description: str
    showOnSkillMap: bool
    staticDeck: bool
    questions: list[PlaylistQuestion]


class PlaylistCatalogResponse(ApiModel):
    playlists: list[PlaylistCatalogEntry]


class RecallSignalJson(ApiModel):
    key: str
    label: str
    kind: str
    role: str
    weight: float
    guidance: str
    variationStrategy: str
    axis: str | None = None


class RecallSignalSpecJson(ApiModel):
    algorithm: str
    version: int
    signals: list[RecallSignalJson]
    structuralElements: list[str]


class AlgorithmSignalSpec(ApiModel):
    slug: str
    name: str
    usesDefault: bool
    seeded: bool
    spec: RecallSignalSpecJson


class SignalSpecCatalogResponse(ApiModel):
    default: RecallSignalSpecJson
    algorithms: list[AlgorithmSignalSpec]


# ─── /admin signals ───


class AdminSignal(ApiModel):
    key: str
    modality: str
    scope: str
    label: str
    description: str = ""
    source: str
    primitive: str | None = None
    implementation: str | None = None
    instructions: str = ""
    criteria: Any = None
    scoreMap: dict[str, Any] = Field(default_factory=dict)
    role: str
    axis: str | None = None
    appliesWhen: str
    needsCorrectness: bool
    weight: float
    displayOrder: int
    status: str
    version: int
    createdAt: str | None = None
    updatedAt: str | None = None
    archivedAt: str | None = None
    # Only in the catalog listing.
    jevQuestion: dict[str, Any] | None = None
    effectiveShare: float | None = None


class CorrectnessDirective(ApiModel):
    modality: str
    instructions: str
    criteria: dict[str, str]
    correctnessWeight: float
    version: int
    updatedAt: str | None = None
    # Only in the catalog listing.
    labels: list[str] | None = None
    weightShare: float | None = None


class AdminAlgorithm(ApiModel):
    slug: str
    name: str


class DeterministicImplementation(ApiModel):
    name: str
    label: str
    description: str


class SignalAdminCatalog(ApiModel):
    modality: str
    stateFields: list[str]
    directive: CorrectnessDirective
    signals: list[AdminSignal]
    algorithms: list[AdminAlgorithm]
    implementations: list[DeterministicImplementation]


class SignalRevision(ApiModel):
    id: int
    subject: str
    action: str
    before: dict[str, Any] | None = None
    after: dict[str, Any] | None = None
    createdAt: str


class McqChoice(ApiModel):
    id: str
    text: str


class McqSample(ApiModel):
    id: str
    question: str
    explanation: str = ""
    choices: list[McqChoice]
    correctChoiceId: str


class SignalResultJson(ApiModel):
    key: str = ""
    label: str = ""
    role: str = ""
    status: str
    raw: Any = None
    score: float | None = None
    confidence: float | None = None
    note: str = ""


class SignalTryResult(ApiModel):
    state: dict[str, Any]
    answeredCorrectly: bool
    applies: bool
    question: dict[str, Any] | None = None
    answer: dict[str, Any] | None = None
    result: SignalResultJson
    model: str | None = None
    requestId: str | None = None
    usage: dict[str, Any] | None = None
