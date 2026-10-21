"""
CineMatch API — FastAPI application entry point.

On startup the server loads the real MovieLens CSV files once and builds both
recommendation models in memory (a few seconds). The held-out evaluation runs
in a background thread so the API responds immediately; /api/stats shows the
real MAE/RMSE as soon as the thread finishes, and honestly reports
"not_computed" until then.
"""
import threading
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api.routes import build_catalog, router
from .ml import evaluation as evaluation_module
from .ml.collaborative import CollaborativeRecommender
from .ml.content_based import ContentRecommender
from .ml.data_loader import load_dataset


def _run_evaluation(app: FastAPI) -> None:
    """Background thread: evaluate the CF model on held-out ratings, then store real metrics."""
    try:
        app.state.evaluation_status = "running"
        result = evaluation_module.evaluate(app.state.cf)
        app.state.evaluation = result
        app.state.evaluation_status = "computed"
    except Exception as exc:  # pragma: no cover - defensive
        app.state.evaluation = {
            "status": "failed",
            "error": str(exc),
            "mae": None,
            "rmse": None,
            "note": "Evaluation failed, so no metrics are displayed.",
        }
        app.state.evaluation_status = "failed"


@asynccontextmanager
async def lifespan(app: FastAPI):
    started = time.time()
    dataset = load_dataset()
    content = ContentRecommender(dataset)
    cf = CollaborativeRecommender(dataset)

    app.state.dataset = dataset
    app.state.content = content
    app.state.cf = cf
    app.state.catalog = build_catalog(dataset)
    app.state.evaluation = None
    app.state.evaluation_status = "pending"
    app.state.started_at = started

    # Warm the cache for a default user so the first demo click is instant.
    default_user = int(cf.user_ids[len(cf.user_ids) // 2])
    threading.Thread(
        target=lambda: (cf.recommend(default_user, n=10), _run_evaluation(app)),
        daemon=True,
    ).start()

    print(
        f"[CineMatch] Loaded {dataset.movies.shape[0]} movies, "
        f"{cf.n_users} users, {dataset.ratings.shape[0]} ratings from {dataset.data_dir}"
    )
    yield
    print("[CineMatch] Shutting down.")


app = FastAPI(
    title="CineMatch API",
    description=(
        "Personalised movie recommendations using content-based filtering "
        "(TF-IDF + cosine similarity) and user-based collaborative filtering, "
        "built on the real MovieLens dataset from this project."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # fine for a local student project; restrict in production
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(router)


@app.exception_handler(Exception)
def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={"detail": f"Server error while handling {request.url.path}: {exc}"},
    )
