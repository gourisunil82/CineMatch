"""
All CineMatch API endpoints.

Every number returned here comes from the real MovieLens CSV files or from the
models built at startup — nothing is hard-coded or simulated.
"""
import math
from typing import List

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query, Request

from ..config import CF_MAX_RECOMMENDATIONS
from ..ml import stats as stats_module
from ..ml import posters
from ..schemas import ErrorDetail, HealthResponse, MoviePage

router = APIRouter(prefix="/api")

SORT_OPTIONS = {"title", "year", "rating", "popularity"}

# Upper bound for one /api/posters batch (protects the backend and TMDB).
MAX_POSTER_IDS = 100


# ----------------------------------------------------------------- helpers
def _state(request: Request) -> dict:
    return {
        "dataset": request.app.state.dataset,
        "content": request.app.state.content,
        "cf": request.app.state.cf,
        "catalog": request.app.state.catalog,
        "evaluation": request.app.state.evaluation,
        "evaluation_status": request.app.state.evaluation_status,
        "started_at": request.app.state.started_at,
        "tmdb_map": getattr(request.app.state, "tmdb_map", {}),
    }


def _poster_url(movie_id: int) -> str | None:
    """
    Poster URL for a movie, taken from the local cache only.

    This never performs network I/O, so the regular endpoints stay fast. The
    dedicated /api/posters endpoint fills the gaps in the background.
    """
    return posters.cached_poster(movie_id)


def _with_posters(items: list) -> list:
    """Copy recommendation rows and attach the cached poster URL to each one."""
    enriched = []
    for item in items:
        row = dict(item)
        poster_url = _poster_url(int(row["movieId"]))
        if poster_url:
            row["posterUrl"] = poster_url
        enriched.append(row)
    return enriched


def _clean_title(title: str) -> str:
    """Strip the trailing '(1995)' year so search behaves the way people expect."""
    return title[::-1].split(" (", 1)[-1][::-1].strip() if " (" in title else title.strip()


# --------------------------------------------------------------- endpoints
@router.get("/health", response_model=HealthResponse, responses={500: {"model": ErrorDetail}})
def health(request: Request):
    import time

    s = _state(request)
    return HealthResponse(
        status="ok",
        dataset_dir=str(s["dataset"].data_dir),
        dataset_loaded=True,
        movies=int(s["dataset"].movies.shape[0]),
        users=int(s["cf"].n_users),
        ratings=int(s["dataset"].ratings.shape[0]),
        evaluation=s["evaluation_status"],
        uptime_seconds=round(time.time() - s["started_at"], 1),
    )


@router.get("/genres")
def genres(request: Request):
    """Every real genre with its movie count."""
    s = _state(request)
    exploded = s["dataset"].movies.explode("genre_list")
    counts = exploded["genre_list"].value_counts()
    return {
        "genres": [
            {"name": g, "movie_count": int(c)} for g, c in counts.sort_index().items()
        ]
    }


@router.get("/movies", response_model=MoviePage, responses={400: {"model": ErrorDetail}})
def list_movies(
    request: Request,
    q: str | None = Query(None, description="Case-insensitive title search"),
    genre: str | None = Query(None, description="Exact genre name, e.g. 'Comedy'"),
    sort_by: str = Query("popularity", pattern="^(title|year|rating|popularity)$"),
    min_ratings: int = Query(0, ge=0, le=500, description="Ignore movies with fewer than this many ratings"),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100),
):
    s = _state(request)
    catalog = s["catalog"]

    if genre:
        genre_lower = genre.strip().lower()
        known = {g.lower() for g in s["dataset"].genres}
        if genre_lower not in known:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown genre '{genre}'. Use GET /api/genres to list valid genres.",
            )
        mask = catalog["genre_list"].apply(lambda lst: genre_lower in [g.lower() for g in lst])
        catalog = catalog[mask]

    if min_ratings > 0:
        catalog = catalog[catalog["rating_count"] >= min_ratings]

    if q:
        needle = q.strip().lower()
        if not needle:
            raise HTTPException(status_code=400, detail="Search text is empty.")
        mask = catalog["search_text"].str.contains(needle, regex=False, na=False)
        catalog = catalog[mask]

    ascending = sort_by == "title"
    if sort_by == "popularity":
        catalog = catalog.sort_values(["rating_count", "avg_rating"], ascending=False)
    elif sort_by == "rating":
        catalog = catalog.sort_values(["avg_rating", "rating_count"], ascending=False)
    else:
        catalog = catalog.sort_values(sort_by, ascending=ascending, na_position="last")

    total = int(catalog.shape[0])
    total_pages = max(1, math.ceil(total / page_size))
    page = min(page, total_pages)
    rows = catalog.iloc[(page - 1) * page_size : page * page_size]

    results = []
    for r in rows.itertuples(index=False):
        movie_id = int(r.movieId)
        results.append(
            {
                "movieId": movie_id,
                "title": r.title,
                "genres": r.genres,
                "year": None if pd.isna(r.year) else int(r.year),
                "avg_rating": None if pd.isna(r.avg_rating) else round(float(r.avg_rating), 2),
                "rating_count": int(r.rating_count),
                "posterUrl": _poster_url(movie_id),
            }
        )
    return MoviePage(
        page=page,
        page_size=page_size,
        total_results=total,
        total_pages=total_pages,
        results=results,
    )


@router.get("/posters")
def movie_posters(
    request: Request,
    ids: str = Query(
        "",
        description="Comma separated MovieLens movie ids, e.g. '1,2,3'. "
        "Results are cached posters plus freshly fetched ones.",
    ),
):
    """
    Batch poster lookup keyed by the MovieLens movie id.

    Cached posters are returned immediately. Posters that are not cached yet are
    fetched from the TMDB movie-details endpoint (at most one TMDB call per
    movie, never at startup and never on every render). If TMDB is unreachable
    or no API key is configured the endpoint still answers with ``null`` values
    so the frontend can fall back to its generated artwork.
    """
    s = _state(request)
    wanted: List[int] = []
    for chunk in ids.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        try:
            movie_id = int(chunk)
        except ValueError:
            continue
        if movie_id > 0 and movie_id not in wanted:
            wanted.append(movie_id)
        if len(wanted) >= MAX_POSTER_IDS:
            break

    if not wanted:
        return {"posters": {}}

    tmdb_map = s["tmdb_map"]
    pairs = [(movie_id, tmdb_map.get(movie_id)) for movie_id in wanted]
    found = posters.fetch_posters(pairs)
    return {
        "posters": {str(movie_id): found.get(movie_id) for movie_id in wanted},
        # status tells the frontend whether a missing poster is final ("missing")
        # or a temporary failure it may retry later ("error" / "unknown").
        "status": {str(movie_id): posters.cached_status(movie_id) for movie_id in wanted},
    }


@router.get("/search/suggest")
def suggest(request: Request, q: str = Query(..., min_length=1), limit: int = Query(8, ge=1, le=20)):
    """Fast title suggestions for the search-as-you-type box."""
    s = _state(request)
    needle = q.strip().lower()
    if not needle:
        return {"suggestions": []}
    catalog = s["catalog"]
    hits = catalog[catalog["search_text"].str.contains(needle, regex=False, na=False)].head(limit)
    suggestions = []
    for r in hits.itertuples(index=False):
        movie_id = int(r.movieId)
        suggestions.append(
            {
                "movieId": movie_id,
                "title": r.title,
                "year": None if pd.isna(r.year) else int(r.year),
                "genres": r.genres,
                "posterUrl": _poster_url(movie_id),
            }
        )
    return {"suggestions": suggestions}


@router.get("/movies/{movie_id}", responses={404: {"model": ErrorDetail}})
def movie_detail(request: Request, movie_id: int):
    s = _state(request)
    catalog = s["catalog"]
    row = catalog[catalog["movieId"] == movie_id]
    if row.empty:
        raise HTTPException(
            status_code=404,
            detail=f"Movie id {movie_id} was not found in the dataset. "
            "Movie ids range from 1 to 9742 in this MovieLens file.",
        )
    r = row.iloc[0]

    tags_df = s["dataset"].tags
    top_tags = (
        tags_df[tags_df["movieId"] == movie_id]["tag"].value_counts().head(8)
        if not tags_df.empty
        else pd.Series(dtype=str)
    )
    links_row = s["dataset"].links[s["dataset"].links["movieId"] == movie_id]
    imdb_id = None
    tmdb_id = None
    if not links_row.empty:
        raw_imdb = links_row.iloc[0]["imdbId"]
        imdb_id = None if pd.isna(raw_imdb) else str(int(raw_imdb))
        tmdb_id = None if pd.isna(links_row.iloc[0]["tmdbId"]) else int(links_row.iloc[0]["tmdbId"])

    return {
        "movieId": int(r.movieId),
        "title": r.title,
        "genres": r.genres,
        "genre_list": list(r.genre_list),
        "year": None if pd.isna(r.year) else int(r.year),
        "avg_rating": None if pd.isna(r.avg_rating) else round(float(r.avg_rating), 2),
        "rating_count": int(r.rating_count),
        "top_tags": [{"tag": t, "count": int(c)} for t, c in top_tags.items()],
        "imdbId": imdb_id,
        "tmdbId": tmdb_id,
        "posterUrl": _poster_url(movie_id),
        "has_tags": bool(str(r.tag_text).strip()),
    }


@router.get("/recommendations/similar/{movie_id}", responses={404: {"model": ErrorDetail}})
def similar_movies(request: Request, movie_id: int, n: int = Query(10, ge=1, le=50)):
    """
    Content-based recommendations (notebook Steps 5-6).

    Movies are ranked by cosine similarity of TF-IDF features built from
    genres and user tags. Similarity is computed per query, so no huge
    movie-to-movie matrix is ever stored.
    """
    s = _state(request)
    if not s["content"].has_movie(movie_id):
        raise HTTPException(
            status_code=404,
            detail=f"Movie id {movie_id} was not found in the dataset, so similar "
            "movies cannot be computed.",
        )
    results = s["content"].similar(movie_id, n=n)
    return {
        "movie_id": movie_id,
        "method": "content_based",
        "method_label": "TF-IDF over genres + tags, cosine similarity",
        "results": _with_posters(results),
    }


@router.get("/recommendations/user/{user_id}", responses={404: {"model": ErrorDetail}})
def user_recommendations(request: Request, user_id: int, n: int = Query(10, ge=1, le=50)):
    """
    Personalised recommendations (notebook Steps 8 and 10).

    User-user collaborative filtering on the real ratings. Movies the user has
    already rated are excluded, and each result carries the predicted rating.
    """
    s = _state(request)
    cf = s["cf"]
    if not cf.known_user(user_id):
        raise HTTPException(
            status_code=404,
            detail=f"User id {user_id} is not in the ratings dataset. "
            f"Valid user ids are {min(cf.user_ids)} to {max(cf.user_ids)}. "
            "Try GET /api/users/sample to pick a real user.",
        )
    results = cf.recommend(user_id, n=n)
    return {
        "user_id": user_id,
        "method": "collaborative_filtering",
        "method_label": "User-user cosine similarity over the training rating matrix",
        "ratings_given": cf.user_rating_count(user_id),
        "neighbours": cf.neighbours(user_id, k=5),
        "results": _with_posters(results),
    }


@router.get("/users/{user_id}/history", responses={404: {"model": ErrorDetail}})
def user_history(request: Request, user_id: int, n: int = Query(15, ge=1, le=50)):
    """A real user's highest-rated movies (notebook Step 11)."""
    s = _state(request)
    cf = s["cf"]
    if not cf.known_user(user_id):
        raise HTTPException(
            status_code=404,
            detail=f"User id {user_id} is not in the ratings dataset. "
            f"Valid user ids are {min(cf.user_ids)} to {max(cf.user_ids)}.",
        )
    results = cf.history(user_id, n=n)
    return {"user_id": user_id, "results": _with_posters(results)}


@router.get("/users/sample")
def sample_users(request: Request):
    """A handful of real user ids spread across different activity levels."""
    s = _state(request)
    cf = s["cf"]
    counts = {u: cf.user_rating_count(u) for u in cf.user_ids}
    ordered = sorted(counts.items(), key=lambda kv: kv[1])
    picks = [
        ordered[int(len(ordered) * f)]
        for f in (0.05, 0.25, 0.5, 0.75, 0.95)
    ]
    return {
        "users": [
            {"userId": int(u), "ratings_given": int(c)} for u, c in picks
        ],
        "total_users": int(cf.n_users),
    }


@router.get("/stats")
def stats(request: Request):
    """Real dataset statistics and, when available, real evaluation metrics."""
    s = _state(request)
    payload = stats_module.compute_stats(
        s["dataset"], s["content"], s["cf"], s["evaluation"]
    )
    payload["evaluation_status"] = s["evaluation_status"]
    return payload


# ------------------------------------------------------------------ catalog
def build_catalog(dataset) -> pd.DataFrame:
    """Precompute the movie catalogue with real rating aggregates, once at startup."""
    agg = (
        dataset.ratings.groupby("movieId")["rating"]
        .agg(avg_rating="mean", rating_count="count")
        .reset_index()
    )
    catalog = dataset.movies.merge(agg, on="movieId", how="left")
    catalog["avg_rating"] = catalog["avg_rating"].fillna(0.0)
    catalog["rating_count"] = catalog["rating_count"].fillna(0).astype(int)
    catalog["search_text"] = (
        catalog["title"].str.lower() + " " + catalog["title"].apply(_clean_title).str.lower()
    )
    return catalog
