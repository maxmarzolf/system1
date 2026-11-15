"""signal_admin_service: the same admin operations for every modality (no database)."""

from __future__ import annotations

import pytest

from app.contracts.submission import SubmissionRecord
from app.core.jev import JevResponse, JevUnavailableError
from app.models import SignalDefinitionDraft, SignalDirectiveUpdate
from app.repositories.signal_definition_repository import SignalVersionConflict
from app.services import signal_admin_service as service
from app.services.evaluation.context import SubmissionContext


class FakeBuilder:
    def __init__(self, modality: str, correct: bool = False, overrides: tuple[str, ...] = ()):
        self.modality = modality
        self.correct = correct
        self.overrides = overrides
        self.bodies: list = []

    async def build(self, body):
        self.bodies.append(body)
        return SubmissionContext(
            modality=self.modality,
            algorithm_slug="heap",
            state={"prompt": "p", "referenceSolution": "ref", "submittedAnswer": body.userAnswer or body.selectedChoiceId},
            elapsed_ms=900,
            record=SubmissionRecord(user_answer="", correct_answer=""),
            deterministic_correct=self.correct,
            overrides=self.overrides,
        )


@pytest.fixture
def repo(monkeypatch):
    state: dict = {"directive": None, "updated": None, "error": None, "writes": [], "builders": {}}

    async def algorithms():
        return [{"slug": "heap", "name": "Heap"}]

    async def directive(modality):
        return state["directive"]

    async def write(*args):
        state["writes"].append(args)
        if state["error"]:
            raise state["error"]
        return state["updated"]

    def builder(modality):
        return state["builders"].setdefault(modality, FakeBuilder(modality))

    monkeypatch.setattr(service.signal_definition_repository, "fetch_algorithms", algorithms)
    monkeypatch.setattr(service.signal_definition_repository, "fetch_directive", directive)
    monkeypatch.setattr(service.signal_definition_repository, "update_definition", write)
    monkeypatch.setattr(service.signal_definition_repository, "set_definition_status", write)
    monkeypatch.setattr(service.signal_definition_repository, "update_directive", write)
    monkeypatch.setattr(service, "context_builder", builder)
    return state


def draft(**overrides) -> SignalDefinitionDraft:
    fields = {
        "key": "heapChoice",
        "label": "Heap choice",
        "source": "jev",
        "primitive": "noul",
        "instructions": "Did they pick the heap?",
        "role": "dimension",
        "weight": 0.1,
        **overrides,
    }
    return SignalDefinitionDraft(**fields)


DIRECTIVE = SignalDirectiveUpdate(instructions="Correct?", criteria={"1": "yes", "0": "no"}, correctnessWeight=0.6, version=1)


async def test_unknown_modalities_are_not_found(repo) -> None:
    with pytest.raises(service.SignalNotFoundError, match="Unknown modality"):
        await service.list_signals("essay")
    with pytest.raises(service.SignalNotFoundError):
        await service.create_signal("essay", draft())


async def test_listing_needs_a_directive(repo) -> None:
    with pytest.raises(service.SignalNotFoundError):
        await service.list_signals("total-recall")


@pytest.mark.parametrize(
    ("call", "args"),
    [
        (service.update_signal, ("ladder", "heapChoice", draft(), 1)),
        (service.set_signal_status, ("ladder", "heapChoice", True, 1)),
        (service.update_directive, ("ladder", DIRECTIVE)),
    ],
)
async def test_missing_rows_and_stale_versions(repo, call, args) -> None:
    with pytest.raises(service.SignalNotFoundError):
        await call(*args)
    assert repo["writes"][0][0] == "ladder"  # every write is scoped to its modality
    repo["error"] = SignalVersionConflict("changed")
    with pytest.raises(service.SignalConflictError):
        await call(*args)


async def test_directive_validation_errors(repo) -> None:
    bad = SignalDirectiveUpdate(
        instructions="", criteria={"1": "y", "0": "n", "2": "?"}, correctnessWeight=0.6, correctnessSource="vibes", version=1
    )
    with pytest.raises(service.SignalValidationError) as error:
        await service.update_directive("mcq", bad)
    assert set(error.value.errors) == {"instructions", "criteria", "correctnessSource"}


async def test_directive_source_is_saved(repo) -> None:
    repo["updated"] = {"modality": "ghost-rep", "correctness_source": "jev"}
    switched = SignalDirectiveUpdate(
        instructions="Correct?", criteria={"1": "yes", "0": "no"}, correctnessWeight=0.6, correctnessSource="jev", version=1
    )
    result = await service.update_directive("ghost-rep", switched)
    assert result == {"modality": "ghost-rep", "correctnessSource": "jev"}
    assert repo["writes"][0][1]["correctness_source"] == "jev"


async def test_preview_shows_the_question_a_draft_would_send(repo) -> None:
    preview = await service.preview_signal("total-recall", draft(instructions="Did they return the index?"))
    assert preview["question"] == {"type": "noul", "instructions": "Did they return the index?"}
    deterministic = await service.preview_signal(
        "total-recall", draft(key="", source="deterministic", primitive=None, implementation="syntaxValid", instructions="")
    )
    assert deterministic["question"] is None


async def test_try_builds_the_submission_through_the_pipeline_contexts(repo) -> None:
    class Jev:
        async def system_one(self, state, questions):
            self.sent = (state, questions)
            return JevResponse(model="jev-test", answers={"heapChoice": {"type": "noul", "noul": 0.8}}, request_id="r1")

    jev = Jev()
    repo["builders"]["microdrill"] = FakeBuilder("microdrill", correct=True)
    result = await service.try_signal("microdrill", draft(), "microdrill-1", "def f():\n    return 1", gateway_factory=lambda: jev)

    body = repo["builders"]["microdrill"].bodies[0]
    assert (body.modality.value, body.exerciseId, body.userAnswer) == ("microdrill", "microdrill-1", "def f():\n    return 1")
    assert jev.sent[0]["submittedAnswer"] == "def f():\n    return 1"
    assert result["answeredCorrectly"] is True and result["result"]["score"] == 80.0 and result["requestId"] == "r1"


async def test_try_shapes_mcq_and_ghost_submissions(repo) -> None:
    deterministic = draft(source="deterministic", primitive=None, implementation="completionTime", instructions="")
    await service.try_signal("mcq", deterministic, "mcq-1", "B", gateway_factory=lambda: None)
    await service.try_signal("ghost-rep", deterministic, "two_sum", "x = 1", reference="x = 1", gateway_factory=lambda: None)
    mcq_body = repo["builders"]["mcq"].bodies[0]
    ghost_body = repo["builders"]["ghost-rep"].bodies[0]
    assert (mcq_body.multipleChoiceProblemId, mcq_body.selectedChoiceId, mcq_body.userAnswer) == ("mcq-1", "B", None)
    assert (ghost_body.cardId, ghost_body.correctAnswer) == ("two_sum", "x = 1")


async def test_try_deterministic_signal_never_calls_jev(repo) -> None:
    def no_gateway():
        raise AssertionError("Jev should not be called")

    repo["builders"]["total-recall"] = FakeBuilder("total-recall", correct=True, overrides=("no_return",))
    result = await service.try_signal(
        "total-recall",
        draft(source="deterministic", primitive=None, implementation="completionTime", instructions=""),
        "first_occurrence",
        "def f():\n    pass",
        gateway_factory=no_gateway,
    )
    assert result["question"] is None and result["answer"] is None
    assert result["answeredCorrectly"] is False  # an override makes it incorrect


async def test_try_reports_jev_outages(repo) -> None:
    class Down:
        async def system_one(self, state, questions):
            raise JevUnavailableError("jev_timeout", "slow")

    with pytest.raises(service.SignalTryError, match="jev_timeout"):
        await service.try_signal("ladder", draft(needs_correctness=True), "ladder-1", "x", gateway_factory=Down)


async def test_samples_come_from_each_modalitys_stored_items(repo, monkeypatch) -> None:
    async def mcqs():
        return [{"id": "mcq-1", "question": "Which?", "choices": [{"id": "A", "text": "Heap"}], "correctChoiceId": "A"}]

    async def exercises(modality):
        return [{"id": f"{modality}-1", "prompt": "Fill it.", "reference": "x = 1"}]

    async def recall():
        return [{"slug": "two_sum", "title": "Two Sum", "description": "Find it.", "code": "a\n{{missing}}", "missing": "b"}]

    monkeypatch.setattr(service.multiple_choice_repository, "fetch_recent_multiple_choice_problems", mcqs)
    monkeypatch.setattr(service.exercise_repository, "fetch_recent_exercises", exercises)
    monkeypatch.setattr(service.unified_catalog_repository, "fetch_recall_samples", recall)

    assert (await service.samples("mcq"))[0]["reference"] == "Heap"
    assert (await service.samples("ladder"))[0]["id"] == "ladder-1"
    recall_sample = (await service.samples("ghost-rep"))[0]
    assert (recall_sample["id"], recall_sample["reference"]) == ("two_sum", "a\nb")


async def test_revision_subjects_are_scoped_to_the_modality(repo, monkeypatch) -> None:
    subjects: list[str] = []

    async def revisions(subject):
        subjects.append(subject)
        return []

    monkeypatch.setattr(service.signal_definition_repository, "fetch_revisions", revisions)
    await service.signal_revisions("microdrill", "nearMiss")
    await service.signal_revisions("microdrill", "directive")
    assert subjects == ["microdrill:nearMiss", "directive:microdrill"]


def test_signal_view_without_a_known_implementation() -> None:
    definition = {
        "key": "ghost",
        "source": "deterministic",
        "primitive": None,
        "implementation": "retired",
        "role": "dimension",
        "weight": 0.2,
        "status": "archived",
    }
    view = service._signal_view(definition, 1.0, "total-recall")
    assert view["jevQuestion"] is None
    assert view["effectiveShare"] == 0.0
