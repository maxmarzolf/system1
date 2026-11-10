"""signal_admin_service branches that the Postgres integration tests don't reach."""

from __future__ import annotations

import pytest

from app.core.jev import JevUnavailableError
from app.models import SignalDefinitionDraft, SignalDirectiveUpdate
from app.repositories.signal_definition_repository import SignalVersionConflict
from app.services import signal_admin_service as service
from app.services.submission_context_service import McqContext

CHOICE_A = {"id": "A", "text": "Use a heap"}
CHOICE_B = {"id": "B", "text": "Sort"}


def context() -> McqContext:
    return McqContext("p1", "Which?", (CHOICE_A, CHOICE_B), CHOICE_A, CHOICE_B, 900)


@pytest.fixture
def repo(monkeypatch):
    state: dict = {"directive": None, "updated": None, "error": None}

    async def algorithms():
        return [{"slug": "heap", "name": "Heap"}]

    async def directive(modality):
        return state["directive"]

    async def write(*_args):
        if state["error"]:
            raise state["error"]
        return state["updated"]

    async def mcq(problem_id, choice_id):
        return context()

    monkeypatch.setattr(service.signal_definition_repository, "fetch_algorithms", algorithms)
    monkeypatch.setattr(service.signal_definition_repository, "fetch_directive", directive)
    monkeypatch.setattr(service.signal_definition_repository, "update_definition", write)
    monkeypatch.setattr(service.signal_definition_repository, "set_definition_status", write)
    monkeypatch.setattr(service.signal_definition_repository, "update_directive", write)
    monkeypatch.setattr(service, "mcq_context_for", mcq)
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


async def test_listing_needs_a_directive(repo) -> None:
    with pytest.raises(service.SignalNotFoundError):
        await service.list_signals()


@pytest.mark.parametrize(
    ("call", "args"),
    [
        (service.update_signal, ("heapChoice", draft(), 1)),
        (service.set_signal_status, ("heapChoice", True, 1)),
        (service.update_directive, (DIRECTIVE,)),
    ],
)
async def test_missing_rows_and_stale_versions(repo, call, args) -> None:
    with pytest.raises(service.SignalNotFoundError):
        await call(*args)
    repo["error"] = SignalVersionConflict("changed")
    with pytest.raises(service.SignalConflictError):
        await call(*args)


async def test_directive_validation_errors(repo) -> None:
    bad = SignalDirectiveUpdate(instructions="", criteria={"1": "y", "0": "n", "2": "?"}, correctnessWeight=0.6, version=1)
    with pytest.raises(service.SignalValidationError) as error:
        await service.update_directive(bad)
    assert set(error.value.errors) == {"instructions", "criteria"}


async def test_try_deterministic_signal_never_calls_jev(repo) -> None:
    def no_gateway():
        raise AssertionError("Jev should not be called")

    result = await service.try_signal(
        draft(source="deterministic", primitive=None, implementation="completionTime", instructions=""),
        "p1",
        "B",
        gateway_factory=no_gateway,
    )
    assert result["question"] is None and result["answer"] is None
    assert result["answeredCorrectly"] is False


async def test_try_reports_jev_outages(repo) -> None:
    class Down:
        async def system_one(self, state, questions):
            raise JevUnavailableError("jev_timeout", "slow")

    with pytest.raises(service.SignalTryError, match="jev_timeout"):
        await service.try_signal(draft(needs_correctness=True), "p1", "B", gateway_factory=Down)


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
    view = service._signal_view(definition, 1.0)
    assert view["jevQuestion"] is None
    assert view["effectiveShare"] == 0.0
