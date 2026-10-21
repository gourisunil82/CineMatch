import { Link } from 'react-router-dom'
import { useWatchlist } from '../context/WatchlistContext'
import PosterArt from '../components/PosterArt'
import { EmptyState } from '../components/States'
import { IconStar, IconBookmark } from '../components/Icons'

function MovieRow({ movie, onRemove, label }) {
  return (
    <div className="wl-row">
      <Link to={`/movie/${movie.movieId}`} aria-label={`Open ${movie.title}`}>
        <PosterArt movie={movie} small />
      </Link>
      <div className="wl-info">
        <div className="wl-title">
          <Link to={`/movie/${movie.movieId}`}>{movie.title}</Link>
        </div>
        <div className="wl-meta">
          {movie.year ? `${movie.year} · ` : ''}
          {(movie.genres || '').replaceAll('|', ' · ')}
        </div>
        {movie.avgRating ? (
          <div className="wl-meta">
            <span className="rating-pill"><IconStar size={12} /> {Number(movie.avgRating).toFixed(1)}</span>
            <span className="ml-2">(at time of saving)</span>
          </div>
        ) : null}
      </div>
      <button className="btn btn-sm btn-danger" onClick={onRemove} aria-label={`Remove ${movie.title} from ${label}`}>
        Remove
      </button>
    </div>
  )
}

export default function Watchlist() {
  const {
    watchlist, favorites,
    removeFromWatchlist, removeFromFavorites,
    clearWatchlist, clearFavorites,
  } = useWatchlist()

  return (
    <div className="page fade-in">
      <div className="container">
        <div className="page-head">
          <h1>Your Watchlist & Favourites</h1>
          <p className="subtitle">
            Your curated library stays with you in this browser (localStorage under
            <code className="inline"> cinematch.watchlist</code> and
            <code className="inline"> cinematch.favorites</code>). It persists on refresh, but isn't synced across devices.
          </p>
        </div>

        <div className="two-col">
          <section className="panel">
            <div className="panel-head">
              <h2>Watchlist</h2>
              {watchlist.length > 0 ? (
                <button className="btn btn-sm btn-danger" onClick={clearWatchlist}>Clear all</button>
              ) : null}
            </div>
            {watchlist.length === 0 ? (
              <EmptyState
                icon={<IconBookmark size={22} />}
                title="Your watchlist is empty"
                message="Movies you add here are remembered in this browser, so you can come back later."
                action={<Link className="btn btn-primary" to="/">Browse movies</Link>}
              />
            ) : (
              <>
                <div>{watchlist.map((m) => (
                  <MovieRow key={m.movieId} movie={m} label="watchlist" onRemove={() => removeFromWatchlist(m.movieId)} />
                ))}</div>
                <p className="list-foot">
                  {watchlist.length} movie{watchlist.length === 1 ? '' : 's'} saved locally.
                </p>
              </>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Favourites</h2>
              {favorites.length > 0 ? (
                <button className="btn btn-sm btn-danger" onClick={clearFavorites}>Clear all</button>
              ) : null}
            </div>
            {favorites.length === 0 ? (
              <EmptyState
                icon={<IconStar size={22} />}
                title="No favourites yet"
                message="Tap the star on any movie card to keep your all-time favourites here."
                action={<Link className="btn btn-gold" to="/">Find favourites</Link>}
              />
            ) : (
              <>
                <div>{favorites.map((m) => (
                  <MovieRow key={m.movieId} movie={m} label="favourites" onRemove={() => removeFromFavorites(m.movieId)} />
                ))}</div>
                <p className="list-foot">
                  {favorites.length} favourite{favorites.length === 1 ? '' : 's'} saved locally.
                </p>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
