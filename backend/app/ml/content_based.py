"""
Content-based recommendations: TF-IDF over genres + tags, cosine similarity.

Ported from notebook Steps 5-6. The key property (kept from the notebook) is
that the full movie-to-movie similarity matrix is NEVER built — 9,742 x 9,742
dense floats would need roughly 760 MB. Instead, one sparse dot product is
computed per request, which takes about 10 ms.
"""
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


class ContentRecommender:
    def __init__(self, dataset):
        self.movies = dataset.movies.reset_index(drop=True)
        self.movie_ids = self.movies["movieId"].to_numpy()
        self._id_to_row = {int(mid): i for i, mid in enumerate(self.movie_ids)}

        self.tfidf = TfidfVectorizer(stop_words="english")
        self.tfidf_matrix = self.tfidf.fit_transform(self.movies["content"].fillna(""))

    # ------------------------------------------------------------------ utils
    def __len__(self) -> int:
        return self.tfidf_matrix.shape[0]

    @property
    def n_terms(self) -> int:
        return self.tfidf_matrix.shape[1]

    def has_movie(self, movie_id: int) -> bool:
        return int(movie_id) in self._id_to_row

    # ----------------------------------------------------------- recommendations
    def similar(self, movie_id: int, n: int = 10) -> list[dict]:
        """Return the n most similar movies by cosine similarity of TF-IDF features."""
        row = self._id_to_row.get(int(movie_id))
        if row is None:
            raise KeyError(f"Movie id {movie_id} is not in the dataset.")

        # One query vector against the sparse matrix — no dense NxN matrix.
        scores = cosine_similarity(self.tfidf_matrix[row], self.tfidf_matrix).ravel()
        scores[row] = -1.0  # exclude the movie itself

        n = max(1, min(int(n), len(scores) - 1))
        top_rows = np.argpartition(scores, -n)[-n:]
        top_rows = top_rows[np.argsort(scores[top_rows])[::-1]]

        source = self.movies.iloc[row]
        results = []
        for r in top_rows:
            m = self.movies.iloc[r]
            results.append(
                {
                    "movieId": int(m["movieId"]),
                    "title": m["title"],
                    "genres": m["genres"],
                    "year": None if pd.isna(m["year"]) else int(m["year"]),
                    "similarity": round(float(scores[r]), 4),
                    "genre_overlap": sorted(
                        set(source["genre_list"]) & set(m["genre_list"])
                    ),
                }
            )
        return results
