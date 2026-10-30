"""API tests with OpenAlex replaced by a fake transport, so they run offline."""

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from tests.helpers import authorship, work


class FakeOpenAlex:
    def __init__(self, status=200):
        self.status = status
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.status != 200:
            return httpx.Response(self.status, json={})
        path = request.url.path
        if path == "/works" and "search" in request.url.params:
            return httpx.Response(200, json={
                "meta": {"count": 1234},
                "results": [work("Soft robot paper", 2026, 50, [authorship("A1", "Prof", "last")])],
            })
        if path == "/works":
            return httpx.Response(200, json={"meta": {"count": 1}, "results": [
                work("Soft robot paper", 2026, None, [authorship("A1", "Prof", "last")]),
            ]})
        if path == "/authors/A1":
            return httpx.Response(200, json={"id": "https://openalex.org/A1", "display_name": "Prof"})
        return httpx.Response(404, json={})


def make_client(tmp_path, fake, limit=30):
    settings = Settings(
        openalex_api_key="test-key",
        openalex_mailto=None,
        cache_path=str(tmp_path / "cache.sqlite3"),
        cache_ttl_seconds=3600,
        searches_per_hour_per_ip=limit,
    )
    return TestClient(create_app(settings, transport=httpx.MockTransport(fake)))


@pytest.fixture
def fake():
    return FakeOpenAlex()


def test_search_returns_professors_and_sends_expected_filters(tmp_path, fake):
    with make_client(tmp_path, fake) as c:
        r = c.get("/api/search", params={"q": "  soft   robots ", "country": "us", "years": 3})
    assert r.status_code == 200
    body = r.json()
    assert body["query"] == "soft robots" and body["country"] == "US"
    assert body["total_papers"] == 1234 and body["cached"] is False
    assert body["professors"][0]["name"] == "Prof"

    params = fake.requests[0].url.params
    assert params["search"] == "soft robots"
    assert params["api_key"] == "test-key"
    assert "type:article" in params["filter"]
    assert "authorships.institutions.country_code:US" in params["filter"]


def test_repeat_search_is_served_from_cache(tmp_path, fake):
    with make_client(tmp_path, fake) as c:
        c.get("/api/search", params={"q": "soft robots"})
        r = c.get("/api/search", params={"q": "SOFT robots"})
    assert r.json()["cached"] is True
    assert len(fake.requests) == 1


def test_rate_limit_applies_to_uncached_searches_only(tmp_path, fake):
    with make_client(tmp_path, fake, limit=1) as c:
        assert c.get("/api/search", params={"q": "soft robots"}).status_code == 200
        assert c.get("/api/search", params={"q": "soft robots"}).status_code == 200  # cached
        assert c.get("/api/search", params={"q": "hard robots"}).status_code == 429


def test_openalex_budget_exhausted_becomes_friendly_503(tmp_path):
    with make_client(tmp_path, FakeOpenAlex(status=429)) as c:
        r = c.get("/api/search", params={"q": "soft robots"})
    assert r.status_code == 503
    assert "tomorrow" in r.json()["detail"]


def test_openalex_outage_becomes_502(tmp_path):
    with make_client(tmp_path, FakeOpenAlex(status=500)) as c:
        assert c.get("/api/search", params={"q": "soft robots"}).status_code == 502


@pytest.mark.parametrize("params", [{"q": "ab"}, {"q": "x" * 201}, {"q": "robots", "country": "USA"}, {"q": "robots", "years": 50}])
def test_search_rejects_bad_input(tmp_path, fake, params):
    with make_client(tmp_path, fake) as c:
        assert c.get("/api/search", params=params).status_code == 422
    assert fake.requests == []


def test_professor_profile(tmp_path, fake):
    with make_client(tmp_path, fake) as c:
        r = c.get("/api/professor/a1")
    assert r.status_code == 200
    assert r.json()["name"] == "Prof" and r.json()["papers"][0]["role"] == "senior"


def test_professor_rejects_non_author_ids_and_handles_unknown(tmp_path, fake):
    with make_client(tmp_path, fake) as c:
        assert c.get("/api/professor/W123").status_code == 422
        assert c.get("/api/professor/A999").status_code == 404


def test_homepage_is_served(tmp_path, fake):
    with make_client(tmp_path, fake) as c:
        r = c.get("/")
    assert r.status_code == 200 and "pleasefindmealab" in r.text
