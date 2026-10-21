"""Small Pydantic models used to document and validate API responses."""
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    dataset_dir: str
    dataset_loaded: bool
    movies: int
    users: int
    ratings: int
    evaluation: str
    uptime_seconds: float


class MovieSummary(BaseModel):
    movieId: int
    title: str
    genres: str
    year: int | None = None
    avg_rating: float | None = None
    rating_count: int = 0
    # Optional TMDB poster URL (added for the poster integration; older
    # clients that ignore this field keep working unchanged).
    posterUrl: str | None = None


class MoviePage(BaseModel):
    page: int
    page_size: int
    total_results: int
    total_pages: int
    results: list[MovieSummary]


class SimilarMovie(BaseModel):
    movieId: int
    title: str
    genres: str
    year: int | None = None
    similarity: float = Field(description="Cosine similarity in [0, 1] from TF-IDF features")
    genre_overlap: list[str] = []


class RecommendedMovie(BaseModel):
    movieId: int
    title: str
    genres: str
    year: int | None = None
    predicted_rating: float | None = None
    train_rating_count: int | None = None


class ErrorDetail(BaseModel):
    detail: str
