import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, errorMessage } from '../api/client'
import PosterArt from '../components/PosterArt'
import MovieCard from '../components/MovieCard'
import { Spinner, EmptyState, ErrorState } from '../components/States'
import { useWatchlist } from '../context/WatchlistContext'
import {
  IconArrowLeft, IconCompass, IconCheck, IconPlus, IconStar, IconStarOutline,
  IconExternal, IconFilm,
} from '../components/Icons'

export default function MovieDetail() {
  const { id } = useParams()
  const movieId = Number(id)
  const valid = Number.isInteger(movieId) && movieId > 0

  const [movie, setMovie] = useState(null)
  const [similar, setSimilar] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [loadKey, setLoadKey] = useState(0)

  const { inWatchlist, inFavorites, toggleWatchlist, toggleFavorite } = useWatchlist()

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    setMovie(null)
    setSimilar([])

    if (!valid) {
      setError(`"${id}" is not a valid movie id. Open a movie from the Discover page instead.`)
      setLoading(false)
      return
    }

    Promise.all([api.movie(movieId), api.similar(movieId, 12)])
      .then(([m, s]) => {
        if (!alive) return
        setMovie(m)
        setSimilar(s.results || [])
        document.title = `${m.title} · CineMatch`
      })
      .catch((e) => { if (alive) setError(errorMessage(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [movieId, id, valid, loadKey])

  if (loading) return <div className="container page"><Spinner label="Loading movie…" /></div>

  if (error) {
    return (
      <div className="container page fade-in">
        <ErrorState error={error} onRetry={() => setLoadKey((k) => k + 1)} />
        <div className="mt-4">
          <Link className="btn" to="/"><IconArrowLeft size={15} /> Back to Discover</Link>
        </div>
      </div>
    )
  }

  const onWatchlist = inWatchlist(movie.movieId)
  const onFav = inFavorites(movie.movieId)
  const imdbUrl = movie.imdbId ? `https://www.imdb.com/title/tt${String(movie.imdbId).padStart(7, '0')}/` : null
  const tmdbUrl = movie.tmdbId ? `https://www.themoviedb.org/movie/${movie.tmdbId}` : null

  return (
    <div className="page fade-in">
      <div className="container">
        <Link className="btn btn-ghost btn-sm" to="/"><IconArrowLeft size={14} /> Back to Discover</Link>

        <div className="detail-hero mt-6">
          <div className="detail-poster">
            <PosterArt movie={movie} />
          </div>

          <div className="detail-meta">
            <div className="title-row">
              <h1>{movie.title}</h1>
              {movie.year ? <span className="year">({movie.year})</span> : null}
            </div>

            <div className="chips mt-3 mb-3">
              {movie.genre_list.map((g) => (
                <Link key={g} className="chip" to={`/?genre=${encodeURIComponent(g)}`}>{g}</Link>
              ))}
            </div>

            <div className="detail-facts">
              <div className="fact">
                <b className="avg-rating">
                  {movie.avg_rating ? (
                    <><IconStar size={16} /> {movie.avg_rating.toFixed(2)}</>
                  ) : '—'}
                </b>
                <span>{movie.rating_count ? `from ${movie.rating_count} real ratings` : 'no ratings yet'}</span>
              </div>
              <div className="fact">
                <b>{movie.rating_count}</b>
                <span>ratings in dataset</span>
              </div>
              <div className="fact">
                <b>{movie.has_tags ? 'Yes' : 'No'}</b>
                <span>user tags available</span>
              </div>
            </div>

            <div className="action-row">
              <button
                className={`btn${onWatchlist ? ' btn-primary' : ''}`}
                aria-pressed={onWatchlist}
                onClick={() => toggleWatchlist(movie)}
              >
                {onWatchlist ? <><IconCheck size={15} /> In watchlist</> : <><IconPlus size={15} /> Add to watchlist</>}
              </button>
              <button
                className={`btn${onFav ? ' btn-gold' : ''}`}
                aria-pressed={onFav}
                onClick={() => toggleFavorite(movie)}
              >
                {onFav ? <><IconStar size={14} /> Favourited</> : <><IconStarOutline size={14} /> Add to favourites</>}
              </button>
              {imdbUrl ? (
                <a className="btn btn-ghost" href={imdbUrl} target="_blank" rel="noreferrer">
                  IMDb <IconExternal size={13} />
                </a>
              ) : null}
              {tmdbUrl ? (
                <a className="btn btn-ghost" href={tmdbUrl} target="_blank" rel="noreferrer">
                  TMDB <IconExternal size={13} />
                </a>
              ) : null}
            </div>

            {movie.top_tags.length > 0 ? (
              <>
                <h3>Tags added by real users</h3>
                <div className="tag-cloud">
                  {movie.top_tags.map((t) => (
                    <span key={t.tag} className="tag">{t.tag} · {t.count}</span>
                  ))}
                </div>
              </>
            ) : (
              <div className="notice">
                This movie has no user tags, so its recommendations rely on genres alone —
                a great example of the cold-start issue explained on the{' '}
                <Link to="/how-it-works">How It Works</Link> page.
              </div>
            )}
          </div>
        </div>

        <section className="panel mt-6">
          <div className="panel-head">
            <h2>Similar movies</h2>
            <span className="score-badge">content-based · TF-IDF + cosine</span>
          </div>
          <div className="method-banner">
            <span className="m-icon"><IconCompass size={17} /></span>
            <div>
              <b>How these were chosen</b>
              <p>
                Genres and user tags were converted into TF-IDF vectors; these 12 movies have the
                highest cosine similarity to <i>{movie.title}</i>. The similarity score (0–1) is shown on each card.
              </p>
            </div>
          </div>

          {similar.length === 0 ? (
            <EmptyState icon={<IconFilm size={22} />} title="No similar movies found" message="This movie has no comparable content features in the dataset." />
          ) : (
            <div className="grid wide">
              {similar.map((m) => (
                <MovieCard
                  key={m.movieId}
                  movie={m}
                  extra={<span className="score-badge">{Math.round(m.similarity * 100)}% match</span>}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
