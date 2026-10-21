"""
Real dataset and model statistics (notebook Steps 2-4 plus model summaries).

Everything here is computed from the actual CSV files — no invented numbers.
"""
import numpy as np
import pandas as pd


def compute_stats(dataset, content_model, cf_model, evaluation: dict | None) -> dict:
    movies, ratings, tags = dataset.movies, dataset.ratings, dataset.tags

    rating_counts = ratings["rating"].value_counts().sort_index()
    genre_counts = (
        movies.explode("genre_list")["genre_list"].value_counts().rename_axis("genre").reset_index(name="movie_count")
    )

    per_movie = ratings.groupby("movieId")["rating"].agg(["count", "mean"])
    per_user = ratings.groupby("userId")["rating"].size()

    decade_counts = (
        movies.dropna(subset=["year"])
        .assign(decade=lambda d: (d["year"] // 10 * 10).astype(int))
        .groupby("decade")
        .size()
        .sort_index()
    )

    return {
        "dataset": {
            "source": "MovieLens ml-latest-small (real CSV files in the data/ folder)",
            "n_movies": int(movies.shape[0]),
            "n_users": int(ratings["userId"].nunique()),
            "n_ratings": int(ratings.shape[0]),
            "n_tags": int(tags.shape[0]),
            "movies_with_tags": int(dataset.tag_text.shape[0]),
            "n_genres": int(len(genre_counts)),
            "rating_min": float(ratings["rating"].min()),
            "rating_max": float(ratings["rating"].max()),
            "rating_mean": round(float(ratings["rating"].mean()), 3),
            "rating_median": float(ratings["rating"].median()),
            "sparsity": round(
                float(1 - ratings.shape[0] / (movies.shape[0] * ratings["userId"].nunique())), 5
            ),
            "missing_values": {
                "movies": int(movies[["movieId", "title", "genres"]].isna().sum().sum()),
                "ratings": int(ratings.isna().sum().sum()),
                "tags": int(tags["tag"].isna().sum()),
            },
        },
        "rating_distribution": [
            {"rating": float(r), "count": int(c)} for r, c in rating_counts.items()
        ],
        "top_genres": [
            {"genre": row.genre, "movie_count": int(row.movie_count)}
            for row in genre_counts.head(15).itertuples(index=False)
        ],
        "movies_by_decade": [
            {"decade": int(d), "movie_count": int(c)} for d, c in decade_counts.items()
        ],
        "activity": {
            "ratings_per_movie_mean": round(float(per_movie["count"].mean()), 1),
            "ratings_per_movie_median": int(per_movie["count"].median()),
            "most_rated_movie": {
                "movieId": int(per_movie["count"].idxmax()),
                "title": str(
                    movies.loc[movies["movieId"] == per_movie["count"].idxmax(), "title"].iloc[0]
                ),
                "count": int(per_movie["count"].max()),
            },
            "ratings_per_user_min": int(per_user.min()),
            "ratings_per_user_max": int(per_user.max()),
            "ratings_per_user_median": int(per_user.median()),
        },
        "models": {
            "content_based": {
                "method": "TF-IDF over genres + aggregated user tags, cosine similarity per query",
                "feature_matrix_shape": list(content_model.tfidf_matrix.shape),
                "vocabulary_size": int(content_model.n_terms),
                "notes": "The full movie-to-movie matrix is never built; similarity is computed for one movie at a time.",
            },
            "collaborative": {
                "method": "User-user cosine similarity on the training user-item matrix",
                "train_ratings": int(len(cf_model.train_ratings)),
                "test_ratings": int(len(cf_model.test_ratings)),
                "user_item_matrix_shape": list(cf_model.user_item_train.shape),
                "matrix_density": round(cf_model.density, 5),
                "global_mean_rating": round(cf_model.global_mean, 3),
            },
            "evaluation": evaluation if evaluation else {"status": "not_computed"},
        },
    }
