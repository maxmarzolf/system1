from __future__ import annotations

from app.core import llm


def test_normalize_llm_provider_aliases() -> None:
    assert llm.normalize_llm_provider("claude") == "claude"
    assert llm.normalize_llm_provider("anthropic") == "claude"
    assert llm.normalize_llm_provider("openai") == "openai"
    assert llm.normalize_llm_provider("gpt") == "openai"
    assert llm.normalize_llm_provider("gemma4") == "gemma"
    assert llm.normalize_llm_provider("unknown") == ""


def test_extract_json_dict_supports_fenced_payload() -> None:
    payload = """```json
{"foo": "bar", "count": 2}
```"""
    assert llm.extract_json_dict(payload) == {"foo": "bar", "count": 2}


def test_extract_json_dict_can_recover_from_prefixed_text() -> None:
    payload = "Model output:\nHere is the JSON:\n{\"ok\": true, \"value\": 42}\nThanks"
    assert llm.extract_json_dict(payload) == {"ok": True, "value": 42}


def test_preferred_provider_chain_dedupes_and_orders() -> None:
    chain = llm.preferred_provider_chain("openai")
    assert chain[0] == "openai"
    assert len(chain) == len(set(chain))
    assert all(provider in {"openai", "claude", "gemma"} for provider in chain)
