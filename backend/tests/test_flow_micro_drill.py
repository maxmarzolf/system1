import pytest
from app.models import FlowMicroDrillRequest
from app.services import micro_drill_service as service


@pytest.mark.asyncio
async def test_flow_micro_drill_reconstructs_solution_and_preserves_focus(monkeypatch):
    monkeypatch.setattr(service, "resolve_available_llm_provider", lambda _: "openai")
    monkeypatch.setattr(service, "llm_provider_available", lambda _: True)
    captured = {}
    def generate(prompt, payload, *args):
        captured["system_prompt"] = prompt
        captured.update(payload)
        return {"prompt": "Return the updated total.", "template": "def add(total, value):\n    return ___ + ___", "answers": ["total", "value"], "language": "python"}
    monkeypatch.setattr(service, "call_llm_json", generate)
    result = await service.generate_flow_micro_drill(FlowMicroDrillRequest(
        cardTitle="Sum",
        prompt="Add",
        target="return a + b",
        focus="Update the running total",
        rep=3,
        phase="challenge",
        proficiency=84,
        weaknessSummary="The update order is still fragile.",
        recentAttempts=[{"modality": "mcq", "successful": False, "score": 0, "weakness": "update order", "question": "Which value updates first?"}],
    ))
    assert result.solution == "def add(total, value):\n    return total + value"
    assert result.template.count("___") == 2
    assert captured["focus"] == "Update the running total"
    assert captured["rep"] == 3
    assert captured["phase"] == "challenge"
    assert captured["recentAttempts"][0]["modality"] == "mcq"
    assert "immutable anchor" in captured["system_prompt"]
    assert "recentAttempts" in captured["system_prompt"]


@pytest.mark.asyncio
@pytest.mark.parametrize("payload", [None, {}, {"prompt": "Task", "template": "return ___", "answers": []}, {"prompt": "Task", "template": "return ___", "answers": ["a\nb"]}])
async def test_invalid_generation_is_retryable(monkeypatch, payload):
    monkeypatch.setattr(service, "llm_provider_available", lambda _: True)
    monkeypatch.setattr(service, "call_llm_json", lambda *args: payload)
    with pytest.raises(service.MicroDrillGenerationError) as error:
        await service.generate_flow_micro_drill(FlowMicroDrillRequest(cardTitle="Sum", prompt="Add", target="return a + b"))
    assert str(error.value)


@pytest.mark.asyncio
async def test_unavailable_provider_is_retryable(monkeypatch):
    monkeypatch.setattr(service, "llm_provider_available", lambda _: False)
    with pytest.raises(service.MicroDrillGenerationError) as error:
        await service.generate_flow_micro_drill(FlowMicroDrillRequest(cardTitle="Sum", prompt="Add", target="return a + b"))
    assert str(error.value)
