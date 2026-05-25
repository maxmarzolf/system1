from __future__ import annotations

from fastapi.testclient import TestClient

from app import main as app_main
from app.core import core_algorithm_practice as core_algorithm_practice_service
from app.main import create_app


def test_core_algorithm_drills_route_filters_by_tag(monkeypatch) -> None:
    async def _noop_connect():
        return None

    async def _noop_disconnect():
        return None

    async def _stub_tagged_drills(tag_slug: str, count: int = 10):
        assert tag_slug == 'sorted-array-leverage'
        assert count == 10
        return {
            'drills': [
                {
                    'id': 'core-algorithm-max_area',
                    'title': 'Container With Most Water',
                    'difficulty': 'Med.',
                    'prompt': 'Two Pointers: discard the limiting side.',
                    'solution': 'def max_area(height):\n    return 0',
                    'missing': '# core algorithm complete',
                    'hint': 'Move the limiting side.',
                    'tags': ['skill-map', 'core-algorithm', 'two-pointers', 'sorted-array-leverage'],
                }
            ],
            'llmUsed': False,
        }

    monkeypatch.setattr(app_main, 'connect', _noop_connect)
    monkeypatch.setattr(app_main, 'disconnect', _noop_disconnect)
    monkeypatch.setattr(core_algorithm_practice_service, 'core_algorithm_drills_for_tag', _stub_tagged_drills)

    app = create_app()
    with TestClient(app) as client:
        response = client.get('/api/coach/core-algorithm-drills', params={'tag': 'sorted-array-leverage'})

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload['llmUsed'] is False
    assert len(payload['drills']) == 1
    assert payload['drills'][0]['tags'][-1] == 'sorted-array-leverage'
