"""
Load and validate the real MovieLens CSV files.

Ported from notebook Steps 1-3 (and the content-text part of Step 5).
The original notebook is never modified; this module reuses the same logic.
"""
import re
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

from ..config import resolve_data_dir

REQUIRED_FILES = ("movies.csv", "ratings.csv", "tags.csv", "links.csv")

# Movies with this genre string have no real genre information.
NO_GENRES = "(no genres listed)"

_YEAR_PATTERN = re.compile(r"\((\d{4})\)\s*$")


@dataclass
class Dataset:
    """In-memory copy of the dataset plus a few derived columns."""

    data_dir: Path
    movies: pd.DataFrame            # movieId, title, genres, genre_list, year, content
    ratings: pd.DataFrame           # userId, movieId, rating, timestamp
    tags: pd.DataFrame              # userId, movieId, tag, timestamp
    links: pd.DataFrame             # movieId, imdbId, tmdbId
    tag_text: pd.Series             # movieId -> concatenated tag string
    genres: list = field(default_factory=list)


def _parse_year(title: str) -> object:
    match = _YEAR_PATTERN.search(title)
    return int(match.group(1)) if match else None


def load_dataset(data_dir: Path | None = None) -> Dataset:
    """Load the four CSVs and prepare the derived columns used by both models."""
    data_dir = data_dir or resolve_data_dir()

    missing = [name for name in REQUIRED_FILES if not (data_dir / name).exists()]
    if missing:
        raise FileNotFoundError(
            f"Missing dataset files {missing} in {data_dir}. "
            "Keep the original MovieLens CSV files in the 'data' folder."
        )

    movies = pd.read_csv(data_dir / "movies.csv")
    ratings = pd.read_csv(data_dir / "ratings.csv")
    tags = pd.read_csv(data_dir / "tags.csv")
    links = pd.read_csv(data_dir / "links.csv")

    # ---- Derived movie columns (notebook Steps 4-5) ----
    movies["title"] = movies["title"].astype(str)
    movies["genres"] = movies["genres"].fillna("")
    movies["genre_list"] = movies["genres"].apply(
        lambda value: [g for g in str(value).split("|") if g and g != NO_GENRES]
    )
    movies["year"] = movies["title"].apply(_parse_year)

    # Aggregate tags per movie, exactly like notebook Step 5.
    tags["tag"] = tags["tag"].fillna("").astype(str)
    tag_text = (
        tags.groupby("movieId")["tag"]
        .apply(lambda values: " ".join(v for v in values if v))
        .rename("tag_text")
    )
    movies = movies.merge(tag_text, on="movieId", how="left")
    movies["tag_text"] = movies["tag_text"].fillna("")

    # Content document = genres (pipe -> space) + tags. Movies without tags
    # still keep their genres, so they always have usable features.
    genres_as_text = movies["genres"].str.replace("|", " ", regex=False)
    movies["content"] = (genres_as_text + " " + movies["tag_text"]).str.strip()

    # Row position <-> movieId mapping (titles can repeat, ids cannot).
    movies = movies.reset_index(drop=True)

    genre_names = sorted(
        {g for lst in movies["genre_list"] for g in lst}
    )

    return Dataset(
        data_dir=data_dir,
        movies=movies,
        ratings=ratings,
        tags=tags,
        links=links,
        tag_text=tag_text,
        genres=genre_names,
    )
