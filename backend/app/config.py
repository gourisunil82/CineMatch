"""
Central configuration for the CineMatch backend.

All paths are resolved relative to this file so the backend works no matter
which folder you start it from:

    backend/app/config.py  ->  app/  ->  backend/  ->  project root  ->  data/
"""
from pathlib import Path

# Path(__file__) is this file; parents[0] = app/, parents[1] = backend/, parents[2] = project root.
BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent

DEFAULT_DATA_DIR = PROJECT_ROOT / "data"

# Same split and seed as the original notebook, so results are reproducible and match.
RANDOM_STATE = 42
TEST_SIZE = 0.20

# Collaborative filtering settings (same defaults as the notebook).
CF_K_NEIGHBOURS = 30
CF_MIN_MOVIE_RATINGS = 5  # a movie needs at least this many training ratings to be recommended
CF_MAX_RECOMMENDATIONS = 50

# How many held-out ratings to evaluate (the notebook uses 2000 for speed).
EVALUATION_ROWS = 2000

# MovieLens rating scale.
RATING_MIN = 0.5
RATING_MAX = 5.0


def resolve_data_dir() -> Path:
    """
    Find the folder that contains movies.csv / ratings.csv / tags.csv / links.csv.

    Tries the normal location first (project_root/data), then a few fallbacks,
    and raises a clear error if nothing is found.
    """
    candidates = [
        DEFAULT_DATA_DIR,
        PROJECT_ROOT / "KTU_Movie_Recommendation_Project" / "data",  # nested checkout
        Path.cwd() / "data",
        Path.cwd().parent / "data",
    ]
    for candidate in candidates:
        if (candidate / "movies.csv").exists() and (candidate / "ratings.csv").exists():
            return candidate

    raise FileNotFoundError(
        "Could not find the MovieLens CSV files. Expected movies.csv and ratings.csv in "
        f"{DEFAULT_DATA_DIR}. Keep the 'data' folder beside the notebook, or start the "
        "server from inside the project folder."
    )
