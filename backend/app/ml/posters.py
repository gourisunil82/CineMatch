"""
TMDB poster integration for CineMatch.

How it works
------------
1. The TMDB API key is read from the process environment. If it is not already
   exported, ``backend/.env`` is parsed (a tiny KEY=VALUE reader, so no extra
   dependency is required) and the key is injected into ``os.environ``.

2. MovieLens ``movieId`` values are mapped to TMDB ids with the real
   ``links.csv`` file that already ships with the dataset (see
   :func:`build_tmdb_map`). Titles are never used to search TMDB.

3. The poster image URL is built from the ``poster_path`` of the TMDB
   *movie details* endpoint (``/3/movie/{tmdb_id}``):
   ``https://image.tmdb.org/t/p/w500{poster_path}``.

4. Every result is cached in ``backend/.posters_cache.json`` (git ignored).
   The cache stores successful lookups, missing posters and failures, each with
   its own time-to-live, so a movie is never requested twice in a short period.

5. The key never leaves the backend: it is not returned by the API, not logged
   and not shipped to the frontend bundle.

The module is used in two ways:

* ``cached_poster(movie_id)`` - cache-only lookup, used to fill the optional
  ``posterUrl`` field of the existing endpoints. It never performs any network
  I/O, so the normal API responses stay fast.
* ``fetch_posters(pairs)`` - batched lookup used by the dedicated
  ``GET /api/posters`` endpoint, which resolves posters that are not cached yet.
"""
import atexit
import json
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from ..config import BACKEND_DIR

# Cache file lives next to the backend and is ignored by git.
CACHE_PATH = BACKEND_DIR / ".posters_cache.json"

TMDB_BASE = "https://api.themoviedb.org/3"
TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500"

# Network / politeness settings.
REQUEST_TIMEOUT = 8.0          # seconds
MIN_REQUEST_INTERVAL = 0.05    # seconds between two TMDB calls (soft rate limit)
MAX_CONCURRENT_LOOKUPS = 6     # parallel TMDB calls inside one batch request
HTTP_RETRIES = 2              # retries for connection resets / 5xx / 429

# Time-to-live (seconds) per cache status.
TTL_OK = 30 * 24 * 3600        # a poster rarely changes -> cache for 30 days
TTL_MISSING = 24 * 3600        # "no poster" is remembered for a day
TTL_ERROR = 120                # transient failures are retried after 2 minutes

# Sentinel used to tell "not cached" apart from "cached, but there is no poster".
_MISS = object()

_lock = threading.Lock()
_rate_lock = threading.Lock()
_cache: Dict[str, dict] = {}
_loaded = False
_inflight: Dict[str, threading.Event] = {}
_last_request_at = 0.0
_last_save_at = 0.0
_dirty = False
_session = None
_flusher_started = False


# --------------------------------------------------------------------- env
def load_env() -> None:
    """
    Read ``backend/.env`` (if present) into ``os.environ``.

    Real environment variables always win, so exporting ``TMDB_API_KEY`` in the
    shell overrides the file. The file is never modified and never leaves the
    backend.
    """
    env_path = BACKEND_DIR / ".env"
    if not env_path.exists():
        return
    try:
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
    except Exception:
        # A broken .env must never stop the server from starting.
        pass


def api_key() -> Optional[str]:
    """Return the TMDB API key, or ``None`` when it is not configured."""
    if "TMDB_API_KEY" not in os.environ:
        load_env()
    key = os.environ.get("TMDB_API_KEY") or os.environ.get("TMDB_KEY")
    return key.strip() if key and key.strip() else None


# ------------------------------------------------------------------- cache
def _ensure_loaded() -> None:
    global _loaded
    if _loaded:
        return
    load_env()
    with _lock:
        if _loaded:
            return
        try:
            if CACHE_PATH.exists():
                data = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
                if isinstance(data, dict):
                    _cache.update(
                        {str(k): v for k, v in data.items() if isinstance(v, dict)}
                    )
        except Exception:
            pass
        _loaded = True
    _start_flusher()


def _save_cache(force: bool = False) -> None:
    """
    Persist the cache to disk. Writes are throttled so batches stay cheap.

    The file is only rewritten when this process actually changed something.
    Without that guard a process that merely imports the module (for example a
    test run) would truncate the shared cache file on exit.
    """
    global _last_save_at, _dirty
    with _lock:
        if not _dirty:
            return
        now = time.time()
        if not force and (now - _last_save_at) < 1.0:
            return
        try:
            payload = json.dumps(_cache, ensure_ascii=False)
        except Exception:
            return
        _last_save_at = now
        _dirty = False
    try:
        tmp = CACHE_PATH.with_suffix(".tmp")
        tmp.write_text(payload, encoding="utf-8")
        try:
            os.replace(tmp, CACHE_PATH)
        except Exception:
            tmp.replace(CACHE_PATH)
    except Exception:
        pass


def _start_flusher() -> None:
    """Keep the cache file on disk up to date while the server runs."""
    global _flusher_started
    with _lock:
        if _flusher_started:
            return
        _flusher_started = True

    def loop():
        while True:
            time.sleep(2.0)
            try:
                _save_cache()
            except Exception:
                pass

    threading.Thread(target=loop, daemon=True).start()


atexit.register(lambda: _save_cache(force=True))


def _cache_lookup(movie_id: int) -> object:
    """
    Return the cached poster URL for ``movie_id``.

    * a string  -> a known poster URL
    * ``None``  -> known to have no poster (or a recent failure)
    * ``_MISS`` -> nothing usable in the cache
    """
    with _lock:
        entry = _cache.get(str(int(movie_id)))
        if not entry:
            return _MISS
        status = entry.get("status")
        ts = float(entry.get("ts") or 0.0)
        age = time.time() - ts
        if status == "ok":
            url = entry.get("posterUrl")
            if url and age <= TTL_OK:
                return url
            return _MISS
        if status == "missing":
            return None if age <= TTL_MISSING else _MISS
        if status == "error":
            return None if age <= TTL_ERROR else _MISS
        return _MISS


def _cache_store(movie_id: int, status: str, **extra) -> None:
    global _dirty
    with _lock:
        entry = {"status": status, "ts": time.time()}
        entry.update(extra)
        _cache[str(int(movie_id))] = entry
        _dirty = True
    _save_cache()


def cached_status(movie_id: int) -> str:
    """
    Status of the cached lookup for ``movie_id``.

    One of ``ok`` / ``missing`` / ``error`` / ``unknown``. The frontend uses it
    to tell "this movie really has no poster" apart from "the lookup failed".
    """
    _ensure_loaded()
    with _lock:
        entry = _cache.get(str(int(movie_id)))
        if not entry:
            return "unknown"
        status = entry.get("status", "unknown")
        ts = float(entry.get("ts") or 0.0)
        age = time.time() - ts
        if status == "ok" and age > TTL_OK:
            return "unknown"
        if status == "missing" and age > TTL_MISSING:
            return "unknown"
        if status == "error" and age > TTL_ERROR:
            return "unknown"
        return status


def cache_stats() -> dict:
    """Small summary of the cache (used by tests and diagnostics)."""
    _ensure_loaded()
    with _lock:
        counts: Dict[str, int] = {}
        for entry in _cache.values():
            counts[entry.get("status", "unknown")] = counts.get(entry.get("status", "unknown"), 0) + 1
        return {"total": len(_cache), "by_status": counts, "path": str(CACHE_PATH)}


def cached_poster(movie_id: int) -> Optional[str]:
    """
    Return the poster URL if it is already cached, otherwise ``None``.

    This never touches the network, so it is safe to call for every movie in a
    response.
    """
    _ensure_loaded()
    value = _cache_lookup(movie_id)
    if value is _MISS:
        return None
    return value  # type: ignore[return-value]


# ------------------------------------------------------------------- tmdb
def build_tmdb_map(links) -> Dict[int, int]:
    """
    Build ``{movieId: tmdbId}`` from the real ``links.csv`` table.

    Missing, empty or invalid ids are skipped instead of raising, so a broken
    row can never break the catalogue.
    """
    mapping: Dict[int, int] = {}
    if links is None:
        return mapping
    try:
        if getattr(links, "empty", True):
            return mapping
        columns = set(links.columns)
        if "movieId" not in columns or "tmdbId" not in columns:
            return mapping
        for movie_id, tmdb_id in links[["movieId", "tmdbId"]].itertuples(index=False, name=None):
            try:
                movie_id = int(movie_id)
            except (TypeError, ValueError):
                continue
            if tmdb_id is None:
                continue
            try:
                if tmdb_id != tmdb_id:  # NaN
                    continue
                tmdb_id = int(tmdb_id)
            except (TypeError, ValueError):
                continue
            if tmdb_id <= 0:
                continue
            mapping[movie_id] = tmdb_id
    except Exception:
        return mapping
    return mapping


def _throttle() -> None:
    """Keep a small gap between two TMDB requests to respect the rate limit."""
    global _last_request_at
    with _rate_lock:
        now = time.monotonic()
        wait = MIN_REQUEST_INTERVAL - (now - _last_request_at)
        if wait > 0:
            time.sleep(wait)
        _last_request_at = time.monotonic()


def _get_session() -> requests.Session:
    """
    Shared HTTP session with connection pooling and retries.

    TMDB occasionally resets a connection; retrying the same GET a couple of
    times turns those blips into a successful lookup instead of a missing
    poster.
    """
    global _session
    if _session is None:
        session = requests.Session()
        retry = Retry(
            total=HTTP_RETRIES,
            connect=HTTP_RETRIES,
            read=HTTP_RETRIES,
            status=HTTP_RETRIES,
            backoff_factor=0.4,
            status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods=frozenset(["GET"]),
            raise_on_status=False,
        )
        adapter = HTTPAdapter(max_retries=retry, pool_connections=4, pool_maxsize=8)
        session.mount("https://", adapter)
        session.mount("http://", adapter)
        _session = session
    return _session


def _request_tmdb(tmdb_id: int) -> Tuple[Optional[str], str]:
    """
    Ask TMDB for one movie. Returns ``(poster_url, status)``.

    ``status`` is one of ``ok`` / ``missing`` / ``error`` / ``no_key``.
    """
    key = api_key()
    if not key:
        return None, "no_key"
    try:
        _throttle()
        response = _get_session().get(
            f"{TMDB_BASE}/movie/{int(tmdb_id)}",
            params={"api_key": key},
            timeout=REQUEST_TIMEOUT,
        )
    except Exception:
        return None, "error"

    if response.status_code == 404:
        return None, "missing"
    if response.status_code == 429:
        # Rate limited - treated as a transient error so it is retried later.
        return None, "error"
    if response.status_code != 200:
        return None, "error"
    try:
        payload = response.json()
    except Exception:
        return None, "error"
    if not isinstance(payload, dict):
        return None, "error"
    poster_path = payload.get("poster_path")
    if not poster_path or not isinstance(poster_path, str):
        return None, "missing"
    return f"{TMDB_IMAGE_BASE}{poster_path}", "ok"


def fetch_poster(movie_id: int, tmdb_id: Optional[int]) -> Optional[str]:
    """
    Return the poster URL for one MovieLens movie, fetching it if needed.

    * the cache is checked first, so a cached movie costs no request;
    * concurrent requests for the same movie share a single TMDB call;
    * every failure mode degrades to ``None`` instead of raising.
    """
    _ensure_loaded()
    try:
        movie_id = int(movie_id)
    except (TypeError, ValueError):
        return None

    value = _cache_lookup(movie_id)
    if value is not _MISS:
        return value  # type: ignore[return-value]

    if not tmdb_id or tmdb_id != tmdb_id:  # missing / NaN tmdb id
        _cache_store(movie_id, "missing")
        return None

    key = str(movie_id)
    while True:
        with _lock:
            event = _inflight.get(key)
            if event is None:
                event = threading.Event()
                _inflight[key] = event
                owner = True
            else:
                owner = False
        if not owner:
            # Another thread is already fetching this movie - wait for it.
            event.wait(timeout=REQUEST_TIMEOUT + 2)
            value = _cache_lookup(movie_id)
            if value is not _MISS:
                return value  # type: ignore[return-value]
            return None
        try:
            url, status = _request_tmdb(int(tmdb_id))
        finally:
            with _lock:
                _inflight.pop(key, None)
            event.set()
        if status == "ok":
            _cache_store(movie_id, "ok", posterUrl=url, tmdbId=int(tmdb_id))
            return url
        if status == "missing":
            _cache_store(movie_id, "missing", tmdbId=int(tmdb_id))
            return None
        if status == "no_key":
            # No key configured: do not pollute the cache, just fall back.
            return None
        _cache_store(movie_id, "error", tmdbId=int(tmdb_id))
        return None


def fetch_posters(pairs: Sequence[Tuple[int, Optional[int]]]) -> Dict[int, Optional[str]]:
    """
    Resolve several posters at once.

    ``pairs`` is a list of ``(movieId, tmdbId)``. Cached movies are returned
    immediately, the rest are fetched in parallel (with a small concurrency
    limit and a soft rate limit).
    """
    results: Dict[int, Optional[str]] = {}
    todo: List[Tuple[int, Optional[int]]] = []
    for movie_id, tmdb_id in pairs:
        try:
            movie_id = int(movie_id)
        except (TypeError, ValueError):
            continue
        value = _cache_lookup(movie_id)
        if value is not _MISS:
            results[movie_id] = value  # type: ignore[assignment]
        else:
            todo.append((movie_id, tmdb_id))

    if not todo:
        return results

    workers = min(MAX_CONCURRENT_LOOKUPS, len(todo))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(fetch_poster, mid, tid): mid for mid, tid in todo}
        for future, movie_id in futures.items():
            try:
                results[movie_id] = future.result()
            except Exception:
                results[movie_id] = None
    return results
