"""
User-based collaborative filtering on the real MovieLens ratings.

Ported from notebook Steps 7-11:
  * 80/20 train/test split with RANDOM_STATE=42 (same as the notebook)
  * sparse user-item matrix built from TRAIN ratings only (no data leakage)
  * user-user cosine similarity on that training matrix
  * rating prediction = similarity-weighted average of neighbour ratings,
    clipped to the MovieLens 0.5-5.0 scale, with mean fallbacks

The 610 x 610 dense user-similarity matrix needs only ~3 MB, so it is safe to
keep in memory. Per-request work is vectorised with NumPy and each user's
recommendation list is cached, so the API stays fast without retraining.
"""
import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.model_selection import train_test_split

from ..config import (
    CF_K_NEIGHBOURS,
    CF_MAX_RECOMMENDATIONS,
    CF_MIN_MOVIE_RATINGS,
    RANDOM_STATE,
    RATING_MAX,
    RATING_MIN,
    TEST_SIZE,
)


class CollaborativeRecommender:
    def __init__(self, dataset):
        self.movies = dataset.movies
        ratings = dataset.ratings[["userId", "movieId", "rating"]].copy()

        # ---- Step 7: split and sparse training matrix -----------------------
        self.train_ratings, self.test_ratings = train_test_split(
            ratings, test_size=TEST_SIZE, random_state=RANDOM_STATE
        )
        self.all_ratings = ratings

        self.user_ids = sorted(ratings["userId"].unique())
        self.movie_ids = sorted(ratings["movieId"].unique())
        self.user_to_idx = {u: i for i, u in enumerate(self.user_ids)}
        self.movie_to_idx = {m: i for i, m in enumerate(self.movie_ids)}

        rows = self.train_ratings["userId"].map(self.user_to_idx).to_numpy()
        cols = self.train_ratings["movieId"].map(self.movie_to_idx).to_numpy()
        vals = self.train_ratings["rating"].to_numpy(dtype=float)
        self.user_item_train = csr_matrix(
            (vals, (rows, cols)), shape=(len(self.user_ids), len(self.movie_ids))
        )

        # ---- Step 8: user-user similarity (train matrix only) ---------------
        self.user_similarity = cosine_similarity(self.user_item_train, dense_output=True)

        self.global_mean = float(self.train_ratings["rating"].mean())
        self.user_means = self.train_ratings.groupby("userId")["rating"].mean().to_dict()
        self.movie_rating_counts = self.train_ratings.groupby("movieId").size()

        # Per-movie rater lookup: movieId -> (sorted user indices, their ratings).
        grouped = self.train_ratings.groupby("movieId")
        self._movie_raters = {
            int(mid): (
                grp["userId"].map(self.user_to_idx).to_numpy(dtype=np.int64),
                grp["rating"].to_numpy(dtype=float),
            )
            for mid, grp in grouped
        }

        # Everything the user has ever rated (train + test) — used to exclude
        # already-seen movies from recommendations and to show rating history.
        self._rated_by_user = (
            ratings.groupby("userId")["movieId"].apply(lambda s: set(s.tolist()))
        )

        self._rec_cache: dict[int, list[dict]] = {}

    # ------------------------------------------------------------------ utils
    @property
    def n_users(self) -> int:
        return len(self.user_ids)

    @property
    def n_movies(self) -> int:
        return len(self.movie_ids)

    @property
    def density(self) -> float:
        return float(
            self.user_item_train.nnz
            / (self.user_item_train.shape[0] * self.user_item_train.shape[1])
        )

    def known_user(self, user_id: int) -> bool:
        return int(user_id) in self.user_to_idx

    def user_rating_count(self, user_id: int) -> int:
        return int(len(self._rated_by_user.get(int(user_id), ())))

    # ------------------------------------------------- rating prediction (Step 8)
    def predict(self, user_id: int, movie_id: int, k: int = CF_K_NEIGHBOURS) -> float:
        """Predict a user's rating for a movie (notebook predict_rating_user_cf)."""
        user_id, movie_id = int(user_id), int(movie_id)
        if user_id not in self.user_to_idx or movie_id not in self.movie_to_idx:
            return self.global_mean

        uidx = self.user_to_idx[user_id]
        rater_idx, rater_vals = self._movie_raters.get(movie_id, (None, None))
        if rater_idx is None or rater_idx.size == 0:
            return self.user_means.get(user_id, self.global_mean)

        keep = rater_idx != uidx
        if not keep.any():
            return self.user_means.get(user_id, self.global_mean)
        cand = rater_idx[keep]

        sims = self.user_similarity[uidx, cand]
        top = np.argsort(sims)[::-1][:k]
        neighbour_sims = sims[top]
        neighbour_vals = rater_vals[keep][top]

        valid = neighbour_sims > 0
        if not valid.any():
            return self.user_means.get(user_id, self.global_mean)

        prediction = float(np.dot(neighbour_sims[valid], neighbour_vals[valid]) / neighbour_sims[valid].sum())
        return float(np.clip(prediction, RATING_MIN, RATING_MAX))

    # ------------------------------------------ personalised list (Step 10, cached)
    def recommend(self, user_id: int, n: int = 10) -> list[dict]:
        """
        Top-n movies the user has not rated, ranked by predicted rating.

        One small, documented improvement over the notebook: movies the user
        rated in the held-out test split are also excluded, so the app never
        recommends something the user already judged. The model itself is
        unchanged (built from training ratings only).
        """
        user_id = int(user_id)
        if user_id not in self.user_to_idx:
            raise KeyError(f"User id {user_id} is not in the ratings dataset.")

        n = max(1, min(int(n), CF_MAX_RECOMMENDATIONS))
        cached = self._rec_cache.get(user_id)
        if cached is None:
            cached = self._build_recommendations(user_id)
            self._rec_cache[user_id] = cached
        return cached[:n]

    def _build_recommendations(self, user_id: int) -> list[dict]:
        uidx = self.user_to_idx[user_id]
        seen = self._rated_by_user.get(user_id, set())

        # Similarity of this user to every other user, self excluded.
        sim_row = self.user_similarity[uidx].copy()
        sim_row[uidx] = 0.0
        fallback = self.user_means.get(user_id, self.global_mean)

        scored = []
        for movie_id, (rater_idx, rater_vals) in self._movie_raters.items():
            if movie_id in seen:
                continue
            if self.movie_rating_counts.get(movie_id, 0) < CF_MIN_MOVIE_RATINGS:
                continue
            w = sim_row[rater_idx]
            mask = w > 0
            if mask.any():
                score = float(np.dot(w[mask], rater_vals[mask]) / w[mask].sum())
                score = float(np.clip(score, RATING_MIN, RATING_MAX))
            else:
                score = fallback
            scored.append((movie_id, score))

        scored.sort(key=lambda item: item[1], reverse=True)
        meta = self.movies.set_index("movieId")
        results = []
        for movie_id, score in scored[:CF_MAX_RECOMMENDATIONS]:
            m = meta.loc[movie_id]
            results.append(
                {
                    "movieId": int(movie_id),
                    "title": m["title"],
                    "genres": m["genres"],
                    "year": None if pd.isna(m["year"]) else int(m["year"]),
                    "predicted_rating": round(score, 3),
                    "train_rating_count": int(self.movie_rating_counts.get(movie_id, 0)),
                }
            )
        return results

    def neighbours(self, user_id: int, k: int = 5) -> list[dict]:
        """Top-k most similar users — used to explain why recommendations appear."""
        user_id = int(user_id)
        if user_id not in self.user_to_idx:
            raise KeyError(f"User id {user_id} is not in the ratings dataset.")
        uidx = self.user_to_idx[user_id]
        sims = self.user_similarity[uidx].copy()
        sims[uidx] = -1.0
        top = np.argsort(sims)[::-1][:k]
        return [
            {
                "userId": int(self.user_ids[i]),
                "similarity": round(float(sims[i]), 4),
                "ratings_given": int((self.user_item_train[i] > 0).sum()),
            }
            for i in top
        ]

    # ------------------------------------------------- rating history (Step 11)
    def history(self, user_id: int, n: int = 15) -> list[dict]:
        """The user's real ratings, highest first (notebook show_user_ratings)."""
        user_id = int(user_id)
        if user_id not in self.user_to_idx:
            raise KeyError(f"User id {user_id} is not in the ratings dataset.")
        hist = self.all_ratings[self.all_ratings["userId"] == user_id].merge(
            self.movies[["movieId", "title", "genres"]], on="movieId", how="left"
        )
        hist = hist.sort_values("rating", ascending=False).head(max(1, int(n)))
        return [
            {
                "movieId": int(r.movieId),
                "title": r.title,
                "genres": r.genres,
                "rating": float(r.rating),
            }
            for r in hist.itertuples(index=False)
        ]
