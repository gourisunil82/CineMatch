import { Link, useNavigate } from 'react-router-dom'
import PosterArt from './PosterArt'
import { useWatchlist } from '../context/WatchlistContext'
import { IconPlus, IconCheck, IconStar, IconStarOutline, IconArrowRight } from './Icons'

/**
 * The main movie card used across the app.
 * Clicking the card opens the detail page; the two round buttons toggle
 * watchlist (teal) and favourite (gold) without navigating.
 */
export default function MovieCard({ movie, extra }) {
  const navigate = useNavigate()
  const { inWatchlist, inFavorites, toggleWatchlist, toggleFavorite } = useWatchlist()

  const open = () => navigate(`/movie/${movie.movieId}`)
  const onWatchlist = inWatchlist(movie.movieId)
  const onFav = inFavorites(movie.movieId)

  return (
    <article
      className="card"
      onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter') open() }}
      tabIndex={0}
      role="button"
      aria-label={`Open details for ${movie.title}`}
    >
      <div className="card-poster">
        <PosterArt movie={movie} />
        <span className="poster-hint" aria-hidden="true">
          View details <IconArrowRight size={13} />
        </span>
      </div>
      <div className="card-body">
        <div className="card-title">{movie.title}</div>
        <div className="card-meta">
          {movie.year ? <span>{movie.year}</span> : null}
          {movie.avg_rating != null && movie.avg_rating > 0 ? (
            <span className="rating-pill">
              <IconStar size={13} /> {Number(movie.avg_rating).toFixed(1)}
              {movie.rating_count ? <span className="count">({movie.rating_count.toLocaleString()})</span> : null}
            </span>
          ) : null}
          {extra}
        </div>
        <div className="card-genres">{(movie.genres || '').replaceAll('|', ' · ')}</div>
        <div className="card-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="icon-btn watch"
            title={onWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
            aria-label={onWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
            aria-pressed={onWatchlist}
            onClick={() => toggleWatchlist(movie)}
          >
            {onWatchlist ? <IconCheck size={16} /> : <IconPlus size={16} />}
          </button>
          <button
            className="icon-btn fav"
            title={onFav ? 'Remove from favourites' : 'Add to favourites'}
            aria-label={onFav ? 'Remove from favourites' : 'Add to favourites'}
            aria-pressed={onFav}
            onClick={() => toggleFavorite(movie)}
          >
            {onFav ? <IconStar size={15} /> : <IconStarOutline size={15} />}
          </button>
          <Link
            to={`/movie/${movie.movieId}`}
            className="icon-btn"
            title="Open details"
            aria-label="Open details"
            onClick={(e) => e.stopPropagation()}
          >
            <IconArrowRight size={15} />
          </Link>
        </div>
      </div>
    </article>
  )
}
