from __future__ import annotations

from fastapi.testclient import TestClient

from app import main as app_main
from app.main import create_app
from app.services import problem_practice_service


def test_problem_drills_route_filters_by_tag(monkeypatch) -> None:
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
    monkeypatch.setattr(problem_practice_service, 'problem_drills_for_tag', _stub_tagged_drills)

    app = create_app()
    with TestClient(app) as client:
        response = client.get('/api/coach/problem-drills', params={'tag': 'sorted-array-leverage'})

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload['llmUsed'] is False
    assert len(payload['drills']) == 1
    assert payload['drills'][0]['tags'][-1] == 'sorted-array-leverage'


def test_static_playlist_drills_route_serves_google_without_generation(monkeypatch) -> None:
    async def _noop_connect():
        return None

    async def _noop_disconnect():
        return None

    monkeypatch.setattr(app_main, 'connect', _noop_connect)
    monkeypatch.setattr(app_main, 'disconnect', _noop_disconnect)

    app = create_app()
    with TestClient(app) as client:
        response = client.get('/api/coach/playlist-drills/google')

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload['llmUsed'] is False
    assert len(payload['drills']) == 50
    assert payload['drills'][0]['id'] == 'playlist-google-1-two-sum'
    assert payload['drills'][-1]['title'] == '642. Design Search Autocomplete System'
    assert 'static-playlist' in payload['drills'][0]['tags']


def test_static_playlist_drills_route_serves_google_skeletons(monkeypatch) -> None:
    async def _noop_connect():
        return None

    async def _noop_disconnect():
        return None

    monkeypatch.setattr(app_main, 'connect', _noop_connect)
    monkeypatch.setattr(app_main, 'disconnect', _noop_disconnect)

    app = create_app()
    with TestClient(app) as client:
        response = client.get('/api/coach/playlist-drills/google-skeletons')

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload['llmUsed'] is False
    assert len(payload['drills']) == 4
    assert payload['drills'][0]['id'] == 'playlist-google-skeletons-bfs-skeleton'
    assert payload['drills'][0]['title'] == 'BFS Skeleton'
    assert 'def bfs(start, graph):' in payload['drills'][0]['solution']
    assert payload['drills'][1]['id'] == 'playlist-google-skeletons-dfs-skeleton'
    assert payload['drills'][1]['title'] == 'DFS Skeleton'
    assert 'def dfs(start, graph):' in payload['drills'][1]['solution']
    assert payload['drills'][2]['id'] == 'playlist-google-skeletons-top-down-dp-skeleton'
    assert payload['drills'][2]['title'] == 'Top-Down DP Skeleton'
    assert 'def solve(state):' in payload['drills'][2]['solution']
    assert payload['drills'][3]['id'] == 'playlist-google-skeletons-bottom-up-dp-skeleton'
    assert payload['drills'][3]['title'] == 'Bottom-Up DP Skeleton'
    assert 'for state in states:' in payload['drills'][3]['solution']


def test_static_playlist_drills_route_accepts_order(monkeypatch) -> None:
    async def _noop_connect():
        return None

    async def _noop_disconnect():
        return None

    monkeypatch.setattr(app_main, 'connect', _noop_connect)
    monkeypatch.setattr(app_main, 'disconnect', _noop_disconnect)

    app = create_app()
    with TestClient(app) as client:
        response = client.get('/api/coach/playlist-drills/google', params={'order': 'solution-length'})

    assert response.status_code == 200, response.text
    payload = response.json()
    lengths = [len(card['solution'].splitlines()) for card in payload['drills']]
    assert lengths == sorted(lengths)


def test_static_playlist_drills_route_serves_google_15_group(monkeypatch) -> None:
    async def _noop_connect():
        return None

    async def _noop_disconnect():
        return None

    monkeypatch.setattr(app_main, 'connect', _noop_connect)
    monkeypatch.setattr(app_main, 'disconnect', _noop_disconnect)

    app = create_app()
    with TestClient(app) as client:
        response = client.get('/api/coach/playlist-drills/google', params={'order': 'google-15'})

    assert response.status_code == 200, response.text
    payload = response.json()
    assert len(payload['drills']) == 15
    assert [card['title'] for card in payload['drills'][:3]] == [
        '1. Two Sum',
        '3. Longest Substring Without Repeating Characters',
        '49. Group Anagrams',
    ]
    assert payload['drills'][-1]['title'] == '84. Largest Rectangle in Histogram'
