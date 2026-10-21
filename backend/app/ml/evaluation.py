"""
Held-out evaluation of the collaborative model (notebook Steps 7 and 9).

The user-item matrix is built from training ratings only, and predictions are
scored against ratings the model never saw, so there is no data leakage.
Metrics are only returned after they have actually been computed — nothing is
estimated or hard-coded.
"""
import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error

from ..config import CF_K_NEIGHBOURS, EVALUATION_ROWS, RANDOM_STATE, TEST_SIZE


def evaluate(cf, n_rows: int = EVALUATION_ROWS) -> dict:
    """
    Evaluate rating prediction on a sample of held-out test ratings.

    Returns a dict with the real MAE / RMSE. Same protocol as the notebook:
    a 20% held-out split, a 2,000-row sample with seed 42, k=30 neighbours.
    """
    test = cf.test_ratings
    n_rows = int(min(max(1, n_rows), len(test)))
    sample = test.sample(n=n_rows, random_state=RANDOM_STATE)

    actual = sample["rating"].to_numpy(dtype=float)
    predicted = np.asarray(
        [cf.predict(int(r.userId), int(r.movieId), k=CF_K_NEIGHBOURS) for r in sample.itertuples(index=False)]
    )

    mae = float(mean_absolute_error(actual, predicted))
    rmse = float(np.sqrt(mean_squared_error(actual, predicted)))

    return {
        "status": "computed",
        "mae": round(mae, 4),
        "rmse": round(rmse, 4),
        "evaluated_ratings": int(len(actual)),
        "k_neighbours": CF_K_NEIGHBOURS,
        "test_size": TEST_SIZE,
        "random_state": RANDOM_STATE,
        "split": "80/20 random row split; model built on train ratings only (no leakage)",
    }


def pending_metrics() -> dict:
    """Honest placeholder used while (or if) evaluation has not run."""
    return {
        "status": "not_computed",
        "mae": None,
        "rmse": None,
        "evaluated_ratings": 0,
        "note": "Evaluation has not finished, so no metrics are shown. "
        "Metrics are only displayed after they are actually calculated.",
    }
