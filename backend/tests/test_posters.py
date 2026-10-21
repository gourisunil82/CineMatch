"""
Tests for the TMDB poster integration.

Run with:
    cd backend
    .\\.venv\\Scripts\\python.exe -m pytest tests -q

None of these tests hit the network: the TMDB HTTP call is monkeypatched.
They cover the MovieLens movieId -> tmdbId mapping, valid/missing poster
paths, cache hits, TMDB failures, concurrency and backward compatibility of
the API responses.
"""
import sys
import threading
import time
from pathlib import Path

import pandas as pd
import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.ml import posters  # noqa: E402


# --------------------------------------------------------------- fixtures
@pytest.fixture(autouse=True)
def isolated_cache(tmp_path, monkeypatch):
    """Every test gets a fresh in-memory + on-disk cache."""
    monkeypatch.setattr(posters, "CACHE_PATH", tmp_path / ".posters_cache.json")
    monkeypatch.setattr(posters, "_cache", {})
    monkeypatch.setattr(posters, "_loaded", True)
    monkeypatch.setattr(posters, "_inflight", {})
    # never read the real backend/.env during the tests
    monkeypatch.setattr(posters, "load_env", lambda: None)
    monkeypatch.delenv("TMDB_API_KEY", raising=False)
    monkeypatch.delenv("TMDB_KEY", raising=False)
    yield


class FakeResponse:
    def __init__(self, status_code, payload=None):
        self.status_code = status_code
        self._payload = payload or {}

    def json(self):
        return self._payload


class FakeSession:
    """Stands in for requests.Session so no test ever touches the network."""

    def __init__(self):
        self.calls = []
        self.status_code = 200
        self.payload = {"poster_path": "/p.jpg"}
        self.raises = None

    def get(self, url, params=None, timeout=None):
        self.calls.append((url, params))
        if self.raises:
            raise self.raises
        return FakeResponse(self.status_code, self.payload)


@pytest.fixture
def session(monkeypatch):
    fake = FakeSession()
    monkeypatch.setattr(posters, "_session", fake)
    return fake


def fake_tmdb(monkeypatch, status_code=200, payload=None, calls=None):
    """Replace the TMDB call with a fake movie-details response."""
    fake = FakeSession()
    fake.status_code = status_code
    if payload is not None:
        fake.payload = payload
    monkeypatch.setattr(posters, "_session", fake)
    if calls is not None:
        fake.calls = calls
    return fake


# --------------------------------------------------------- id mapping
def test_links_csv_maps_movielens_id_to_tmdb_id():
    """The real links.csv rows map cleanly onto tmdbId values."""
    data_dir = BACKEND_DIR.parent / "data"
    links = pd.read_csv(data_dir / "links.csv")
    first = links.iloc[0]
    assert int(first["movieId"]) == 1
    assert int(first["tmdbId"]) == 862


def test_build_tmdb_map_uses_real_links_csv():
    data_dir = BACKEND_DIR.parent / "data"
    links = pd.read_csv(data_dir / "links.csv")
    mapping = posters.build_tmdb_map(links)
    assert mapping[1] == 862
    assert mapping[2] == 8844
    assert len(mapping) > 9000


def test_build_tmdb_map_skips_invalid_ids():
    links = pd.DataFrame(
        {
            "movieId": [1, 2, 3, 4, 5],
            "tmdbId": [862, float("nan"), 0, -5, 129],
        }
    )
    mapping = posters.build_tmdb_map(links)
    assert mapping == {1: 862, 5: 129}


def test_build_tmdb_map_handles_missing_columns():
    assert posters.build_tmdb_map(pd.DataFrame({"movieId": [1]})) == {}
    assert posters.build_tmdb_map(None) == {}


def test_fetch_poster_uses_tmdb_id_not_title(monkeypatch):
    """A known tmdbId must be used to build the image URL (no title search)."""
    monkeypatch.setenv("TMDB_API_KEY", "test-key")
    fake = fake_tmdb(monkeypatch, payload={"poster_path": "/abc123.jpg"})

    url = posters.fetch_poster(1, 862)

    assert url == "https://image.tmdb.org/t/p/w500/abc123.jpg"
    assert fake.calls[0][0] == "https://api.themoviedb.org/3/movie/862"
    assert fake.calls[0][1]["api_key"] == "test-key"
    assert "search" not in fake.calls[0][0]


# ------------------------------------------------------- poster paths
def test_valid_poster_path_is_converted(monkeypatch):
    monkeypatch.setenv("TMDB_API_KEY", "test-key")
    fake_tmdb(monkeypatch, payload={"poster_path": "/xyz.png"})
    assert posters.fetch_poster(5, 1234) == "https://image.tmdb.org/t/p/w500/xyz.png"


def test_missing_poster_path_returns_none_and_is_cached(monkeypatch):
    monkeypatch.setenv("TMDB_API_KEY", "test-key")
    fake = fake_tmdb(monkeypatch, payload={"poster_path": None})

    assert posters.fetch_poster(7, 55) is None
    # the second call must be served from the cache -> no new TMDB request
    assert posters.fetch_poster(7, 55) is None
    assert len(fake.calls) == 1
    assert posters._cache["7"]["status"] == "missing"


def test_missing_tmdb_id_returns_none_without_request(monkeypatch):
    monkeypatch.setenv("TMDB_API_KEY", "test-key")
    fake = fake_tmdb(monkeypatch)
    fake.raises = AssertionError("TMDB must not be called without a tmdbId")

    assert posters.fetch_poster(9, None) is None
    assert posters.fetch_poster(9, float("nan")) is None
    assert fake.calls == []


# --------------------------------------------------------- cache hits
def test_successful_lookup_is_cached_and_reused(monkeypatch):
    monkeypatch.setenv("TMDB_API_KEY", "test-key")
    fake = fake_tmdb(monkeypatch, payload={"poster_path": "/cached.jpg"})

    first = posters.fetch_poster(42, 999)
    second = posters.fetch_poster(42, 999)

    assert first == second == "https://image.tmdb.org/t/p/w500/cached.jpg"
    assert len(fake.calls) == 1  # cache hit -> no second TMDB request


def test_cached_poster_does_no_network_io(monkeypatch):
    """cached_poster() is the fast path used by the regular API responses."""
    monkeypatch.setenv("TMDB_API_KEY", "test-key")
    fake = fake_tmdb(monkeypatch)
    fake.raises = AssertionError("cached_poster must never touch the network")

    assert posters.cached_poster(1) is None


def test_cache_persists_to_disk_and_reloads(monkeypatch):
    monkeypatch.setenv("TMDB_API_KEY", "test-key")
    fake_tmdb(monkeypatch, payload={"poster_path": "/disk.jpg"})
    posters.fetch_poster(77, 111)

    posters._save_cache(force=True)
    assert posters.CACHE_PATH.exists()
    assert "77" in posters.CACHE_PATH.read_text(encoding="utf-8")

    # simulate a fresh process: empty memory cache, same file on disk
    monkeypatch.setattr(posters, "_cache", {})
    monkeypatch.setattr(posters, "_loaded", False)
    fake_tmdb(monkeypatch, status_code=500)  # would fail if a request was made
    assert posters.fetch_poster(77, 111) == "https://image.tmdb.org/t/p/w500/disk.jpg"


def test_read_only_process_does_not_truncate_the_cache_file(monkeypatch):
    """
    A process that only reads the cache must never overwrite it.

    Regression test: the exit handler used to write an empty cache and wipe
    every poster another process had already cached.
    """
    monkeypatch.setenv("TMDB_API_KEY", "test-key")
    fake_tmdb(monkeypatch, payload={"poster_path": "/keep.jpg"})
    posters.fetch_poster(101, 111)
    posters._save_cache(force=True)
    saved = posters.CACHE_PATH.read_text(encoding="utf-8")
    assert "101" in saved

    # a fresh process loads the cache and changes nothing
    monkeypatch.setattr(posters, "_cache", {})
    monkeypatch.setattr(posters, "_loaded", False)
    posters._ensure_loaded()
    posters._save_cache(force=True)

    assert posters.CACHE_PATH.read_text(encoding="utf-8") == saved


def test_missing_entry_expires_after_ttl(monkeypatch):
    """A cached 'no poster' entry is retried once the TTL is over."""
    monkeypatch.setenv("TMDB_API_KEY", "test-key")
    fake_tmdb(monkeypatch, payload={"poster_path": None})
    posters.fetch_poster(8, 88)
    assert posters._cache["8"]["status"] == "missing"

    # pretend the entry is old
    posters._cache["8"]["ts"] = time.time() - posters.TTL_MISSING - 1
    fake = fake_tmdb(monkeypatch, payload={"poster_path": "/later.jpg"})
    assert posters.fetch_poster(8, 88) == "https://image.tmdb.org/t/p/w500/later.jpg"
    assert len(fake.calls) == 1


# ------------------------------------------------------- API failures
def test_tmdb_http_error_is_handled_gracefully(monkeypatch):
    monkeypatch.setenv("TMDB_API_KEY", "test-key")
    fake_tmdb(monkeypatch, status_code=401, payload={"status_message": "invalid key"})
    assert posters.fetch_poster(11, 222) is None
    assert posters._cache["11"]["status"] == "error"


def test_tmdb_404_is_treated_as_missing(monkeypatch):
    monkeypatch.setenv("TMDB_API_KEY", "test-key")
    fake_tmdb(monkeypatch, status_code=404)
    assert posters.fetch_poster(12, 333) is None
    assert posters._cache["12"]["status"] == "missing"


def test_tmdb_rate_limit_is_treated_as_transient(monkeypatch):
    monkeypatch.setenv("TMDB_API_KEY", "test-key")
    fake_tmdb(monkeypatch, status_code=429)
    assert posters.fetch_poster(20, 555) is None
    assert posters._cache["20"]["status"] == "error"


def test_network_exception_is_handled_gracefully(monkeypatch):
    monkeypatch.setenv("TMDB_API_KEY", "test-key")

    def boom(*args, **kwargs):
        raise posters.requests.exceptions.Timeout("timed out")

    monkeypatch.setattr(posters.requests, "get", boom)
    assert posters.fetch_poster(13, 444) is None
    assert posters._cache["13"]["status"] == "error"


def test_missing_api_key_returns_none_without_request(monkeypatch):
    fake = fake_tmdb(monkeypatch)
    fake.raises = AssertionError("TMDB must not be called without an API key")

    assert posters.fetch_poster(14, 555) is None
    assert fake.calls == []
    # a missing key must not be cached, so adding the key later still works
    assert "14" not in posters._cache


# ------------------------------------------------------------ batching
def test_fetch_posters_resolves_a_batch(monkeypatch):
    monkeypatch.setenv("TMDB_API_KEY", "test-key")
    fake_tmdb(monkeypatch, payload={"poster_path": "/batch.jpg"})
    found = posters.fetch_posters([(1, 862), (2, 1893), (3, None)])
    assert found[1] == "https://image.tmdb.org/t/p/w500/batch.jpg"
    assert found[2] == "https://image.tmdb.org/t/p/w500/batch.jpg"
    assert found[3] is None


def test_fetch_posters_uses_cache_for_known_movies(monkeypatch):
    monkeypatch.setenv("TMDB_API_KEY", "test-key")
    fake_tmdb(monkeypatch, payload={"poster_path": "/x.jpg"})
    posters.fetch_poster(1, 862)

    fake = fake_tmdb(monkeypatch, payload={"poster_path": "/y.jpg"})
    found = posters.fetch_posters([(1, 862)])
    assert found[1] == "https://image.tmdb.org/t/p/w500/x.jpg"
    assert fake.calls == []


def test_concurrent_requests_share_one_tmdb_call(monkeypatch):
    """Two threads asking for the same movie must not cause two TMDB calls."""
    monkeypatch.setenv("TMDB_API_KEY", "test-key")
    fake = FakeSession()
    fake.payload = {"poster_path": "/shared.jpg"}
    monkeypatch.setattr(posters, "_session", fake)

    original_get = fake.get

    def slow_get(url, params=None, timeout=None):
        time.sleep(0.05)
        return original_get(url, params=params, timeout=timeout)

    fake.get = slow_get

    results = []
    threads = [
        threading.Thread(target=lambda: results.append(posters.fetch_poster(31, 300))),
        threading.Thread(target=lambda: results.append(posters.fetch_poster(31, 300))),
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(fake.calls) == 1
    assert results == ["https://image.tmdb.org/t/p/w500/shared.jpg"] * 2


# ---------------------------------------------- backward compatibility
def test_movie_summary_schema_keeps_existing_fields_and_adds_optional_poster():
    from app.schemas import MovieSummary

    fields = set(MovieSummary.model_fields)
    for existing in ("movieId", "title", "genres", "year", "avg_rating", "rating_count"):
        assert existing in fields
    # posterUrl must be optional so old clients keep working
    assert "posterUrl" in fields
    assert MovieSummary.model_fields["posterUrl"].is_required() is False


def test_movie_summary_accepts_old_payload_without_poster():
    from app.schemas import MovieSummary

    movie = MovieSummary(movieId=1, title="Toy Story", genres="Animation", year=1995)
    assert movie.posterUrl is None
    assert movie.title == "Toy Story"


def test_posters_endpoint_returns_movie_lens_ids(monkeypatch):
    """The batch endpoint is keyed by the MovieLens movie id."""
    from app.api import routes

    monkeypatch.setenv("TMDB_API_KEY", "test-key")
    fake_tmdb(monkeypatch, payload={"poster_path": "/end.jpg"})

    class FakeState:
        tmdb_map = {1: 862, 2: 1893}
        dataset = None
        content = None
        cf = None
        catalog = None
        evaluation = None
        evaluation_status = "pending"
        started_at = 0.0

    class FakeApp:
        state = FakeState()

    class FakeRequest:
        app = FakeApp()

    payload = routes.movie_posters(FakeRequest(), "1,2,999")
    assert set(payload["posters"]) == {"1", "2", "999"}
    assert payload["posters"]["1"] == "https://image.tmdb.org/t/p/w500/end.jpg"
    assert payload["posters"]["999"] is None  # no tmdb id in links.csv


def test_posters_endpoint_ignores_invalid_ids(monkeypatch):
    from app.api import routes

    class FakeState:
        tmdb_map = {}
        dataset = None
        content = None
        cf = None
        catalog = None
        evaluation = None
        evaluation_status = "pending"
        started_at = 0.0

    class FakeApp:
        state = FakeState()

    class FakeRequest:
        app = FakeApp()

    payload = routes.movie_posters(FakeRequest(), "abc,,0,-3, 5 ,5")
    assert payload["posters"] == {"5": None}
