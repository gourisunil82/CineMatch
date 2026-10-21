import { createContext, useContext, useEffect, useMemo, useState } from 'react'

/**
 * Watchlist + favourites, persisted in this browser's localStorage.
 *
 * Persistence behaviour (shown in the UI too):
 *   - Data is saved under the keys "cinematch.watchlist" and "cinematch.favorites".
 *   - It is stored ONLY in this browser on this device — no account, no server.
 *   - Clearing site data or using another browser/device starts fresh.
 */
const WatchlistContext = createContext(null)

const WATCHLIST_KEY = 'cinematch.watchlist'
const FAVORITES_KEY = 'cinematch.favorites'

function load(key) {
  try {
    const raw = window.localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function save(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full or blocked — feature degrades gracefully to in-memory only */
  }
}

/** Shape stored when the user clicks the watchlist / favourite button. */
export function toMovieRecord(movie) {
  return {
    movieId: movie.movieId,
    title: movie.title,
    genres: movie.genres,
    year: movie.year ?? null,
    avgRating: movie.avg_rating ?? null,
    ratingCount: movie.rating_count ?? null,
    addedAt: Date.now(),
  }
}

export function WatchlistProvider({ children }) {
  const [watchlist, setWatchlist] = useState(() => load(WATCHLIST_KEY))
  const [favorites, setFavorites] = useState(() => load(FAVORITES_KEY))

  useEffect(() => { save(WATCHLIST_KEY, watchlist) }, [watchlist])
  useEffect(() => { save(FAVORITES_KEY, favorites) }, [favorites])

  const value = useMemo(() => {
    const has = (list, id) => list.some((m) => m.movieId === id)
    const toggle = (setter, list, movie) => {
      const record = toMovieRecord(movie)
      if (has(list, movie.movieId)) {
        setter(list.filter((m) => m.movieId !== movie.movieId))
        return false
      }
      setter([record, ...list])
      return true
    }

    return {
      watchlist,
      favorites,
      inWatchlist: (id) => has(watchlist, id),
      inFavorites: (id) => has(favorites, id),
      toggleWatchlist: (movie) => toggle(setWatchlist, watchlist, movie),
      toggleFavorite: (movie) => toggle(setFavorites, favorites, movie),
      removeFromWatchlist: (id) => setWatchlist((l) => l.filter((m) => m.movieId !== id)),
      removeFromFavorites: (id) => setFavorites((l) => l.filter((m) => m.movieId !== id)),
      clearWatchlist: () => setWatchlist([]),
      clearFavorites: () => setFavorites([]),
    }
  }, [watchlist, favorites])

  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>
}

export function useWatchlist() {
  const ctx = useContext(WatchlistContext)
  if (!ctx) throw new Error('useWatchlist must be used inside <WatchlistProvider>')
  return ctx
}
