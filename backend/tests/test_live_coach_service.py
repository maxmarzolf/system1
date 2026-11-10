from __future__ import annotations

import asyncio
import json

from fastapi import WebSocketDisconnect

from app.services import live_coach_service as service


class FakeBrowser:
    def __init__(self) -> None:
        self.incoming: asyncio.Queue[str | None] = asyncio.Queue()
        self.sent: list[dict] = []
        self.closed_code: int | None = None

    async def accept(self) -> None:
        pass

    async def receive_text(self) -> str:
        message = await self.incoming.get()
        if message is None:
            raise WebSocketDisconnect()
        return message

    async def send_json(self, message: dict) -> None:
        self.sent.append(message)

    async def close(self, code: int = 1000) -> None:
        self.closed_code = code


class FakeModel:
    def __init__(self) -> None:
        self.incoming: asyncio.Queue[str] = asyncio.Queue()
        self.sent: list[dict] = []

    async def send(self, message: str) -> None:
        self.sent.append(json.loads(message))

    async def recv(self) -> str:
        return await self.incoming.get()

    async def close(self) -> None:
        pass


async def wait_for(condition) -> None:
    for _ in range(100):
        if condition():
            return
        await asyncio.sleep(0.01)
    raise AssertionError("Timed out waiting for WebSocket event")


def observation(sequence: int, code: str) -> str:
    return json.dumps({
        "sequence": sequence,
        "cardId": "bfs",
        "cardTitle": "BFS",
        "prompt": "Write a breadth first search.",
        "referenceAnswer": "def bfs(): ...",
        "code": code,
        "language": "python",
        "phase": "typing",
        "feedback": {"primaryFocus": "visited set"},
        "recentAttempts": [{"exact": False}],
    })


def test_live_coach_steers_to_newest_observation(monkeypatch) -> None:
    async def run() -> None:
        browser = FakeBrowser()
        model = FakeModel()

        async def connect(*_args, **_kwargs):
            return model

        monkeypatch.setattr(service.settings, "coach_openai_api_key", "test-key")
        monkeypatch.setattr(service.websockets, "connect", connect)
        task = asyncio.create_task(service.live_coach(browser))
        try:
            await browser.incoming.put(observation(1, "visited = {}"))
            await wait_for(lambda: len(model.sent) == 1)
            assert model.sent[0]["type"] == "response.create"
            assert model.sent[0]["store"] is False
            assert model.sent[0]["model"] == service.settings.coach_live_model

            await model.incoming.put(json.dumps({"type": "response.created", "response": {"id": "resp_1"}}))
            await browser.incoming.put(observation(2, "visited = set()"))
            await wait_for(lambda: len(model.sent) == 2)
            assert model.sent[1]["type"] == "response.steer"
            assert model.sent[1]["previous_response_id"] == "resp_1"
            assert "visited = set()" in model.sent[1]["input"]

            await model.incoming.put(json.dumps({"type": "response.output_text.delta", "delta": "Stale hint"}))
            await model.incoming.put(json.dumps({"type": "response.incomplete", "response": {"id": "resp_1"}}))
            await model.incoming.put(json.dumps({"type": "response.created", "response": {"id": "resp_2"}}))
            await model.incoming.put(json.dumps({"type": "response.output_text.delta", "delta": "Good self-correction. Decide when to mark a node visited."}))
            await model.incoming.put(json.dumps({"type": "response.completed", "response": {"id": "resp_2"}}))
            await wait_for(lambda: len(browser.sent) == 1)
            assert browser.sent == [{"type": "feedback", "sequence": 2,
                                     "message": "Good self-correction. Decide when to mark a node visited."}]
        finally:
            await browser.incoming.put(None)
            await task

    asyncio.run(run())


def test_live_coach_reports_missing_key(monkeypatch) -> None:
    async def run() -> None:
        browser = FakeBrowser()
        monkeypatch.setattr(service.settings, "coach_openai_api_key", "")
        await service.live_coach(browser)
        assert browser.sent == [{"type": "error", "message": "Configure an OpenAI API key for live coaching."}]

    asyncio.run(run())


def test_model_error_closes_session_even_with_pending_edit(monkeypatch) -> None:
    async def run() -> None:
        browser = FakeBrowser()
        model = FakeModel()

        async def connect(*_args, **_kwargs):
            return model

        monkeypatch.setattr(service.settings, "coach_openai_api_key", "test-key")
        monkeypatch.setattr(service.websockets, "connect", connect)
        task = asyncio.create_task(service.live_coach(browser))
        await browser.incoming.put(observation(1, "visited = {}"))
        await wait_for(lambda: len(model.sent) == 1)
        await model.incoming.put(json.dumps({"type": "response.created", "response": {"id": "resp_1"}}))
        await browser.incoming.put(observation(2, "visited = set()"))
        await wait_for(lambda: len(model.sent) == 2)
        await browser.incoming.put(observation(3, "visited = set()\nqueue = [start]"))
        await wait_for(lambda: browser.incoming.empty())
        await model.incoming.put(json.dumps({"type": "error", "error": {"code": "internal_error"}}))
        await task

        assert browser.sent == [{"type": "error", "message": "The live coach hit a model error. Reconnecting…"}]
        assert browser.closed_code == 1011
        assert len(model.sent) == 2

    asyncio.run(run())
