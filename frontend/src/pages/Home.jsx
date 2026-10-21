import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, errorMessage } from '../api/client'
import SearchBar from '../components/SearchBar'
import MovieCard from '../components/MovieCard'
import Pagination from '../components/Pagination'
import { SkeletonGrid, EmptyState, ErrorState } from '../components/States'
import { IconSearch } from '../components/Icons'

const SORTS = [
  { value: 'popularity', label: 'Most popular' },
  { value: 'rating', label: 'Top rated' },
  { value: 'year', label: 'Newest' },
  { value: 'title', label: 'A → Z' },
]

export default function Home() {
  const [searchParams, setSearchParams] = useSearchParams()

  const query = searchParams.get('q') || ''
  const genre = searchParams.get('genre') || ''
  const sortBy = searchParams.get('sort') || 'popularity'
  const page = Number(searchParams.get('page') || 1)

  const [searchText, setSearchText] = useState(query)
  const [genres, setGenres] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [loadKey, setLoadKey] = useState(0)

  // keep the input in sync when the URL query changes (e.g. clearing search)
  useEffect(() => { setSearchText(query) }, [query])

  useEffect(() => {
    api.genres().then((d) => setGenres(d.genres || [])).catch(() => setGenres([]))
  }, [])

  const update = useCallback((patch) => {
    const next = new URLSearchParams(searchParams)
    Object.entries(patch).forEach(([k, v]) => {
      if (v === '' || v === null || v === undefined) next.delete(k)
      else next.set(k, String(v))
    })
    if (!('page' in patch)) next.delete('page') // any filter change resets paging
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    api.movies({ q: query, genre, sort_by: sortBy, page, page_size: 24 })
      .then((d) => { if (alive) setData(d) })
      .catch((e) => { if (alive) setError(errorMessage(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [query, genre, sortBy, page, loadKey])

  const submitSearch = (text) => update({ q: text.trim() })

  return (
    <div className="page fade-in">
      <section className="hero">
        <div className="container">
          <span className="kicker">KTU S5 · Machine Learning Project</span>
          <h1>
            Discover movies with <em>cinematic intelligence</em>
          </h1>
          <p className="subtitle">
            CineMatch blends content-based filtering and user-based collaborative filtering on the real MovieLens dataset
            to surface films you'll actually want to watch — tailored to genre, tags, and the tastes of 610 real viewers.
          </p>
          <div className="center-row">
            <SearchBar
              value={searchText}
              onChange={setSearchText}
              onSubmit={submitSearch}
              placeholder="Search the catalog by title… e.g. Toy Story"
            />
          </div>
          <div className="hero-stats">
            <div className="hero-stat"><b>9,742</b><span>Movies</span></div>
            <div className="hero-stat"><b>100,836</b><span>Ratings</span></div>
            <div className="hero-stat"><b>610</b><span>Users</span></div>
            <div className="hero-stat"><b>19</b><span>Genres</span></div>
          </div>
        </div>
      </section>

      <div className="container">
        <div className="section-label">Browse by Genre</div>
        <div className="chips-wrap">
          <div className="chips scrollable" role="group" aria-label="Filter by genre">
            <button className={`chip${genre === '' ? ' active' : ''}`} onClick={() => update({ genre: '' })}>
              All Genres
            </button>
          {genres.map((g) => (
            <button
              key={g.name}
              className={`chip${genre === g.name ? ' active' : ''}`}
              onClick={() => update({ genre: genre === g.name ? '' : g.name })}
            >
              {g.name} <span className="chip-count">· {g.movie_count}</span>
            </button>
          ))}
          </div>
          <div className="chips-fade chips-fade-left" aria-hidden="true" />
          <div className="chips-fade chips-fade-right" aria-hidden="true" />
        </div>

        <div className="toolbar">
          <span className="result-count">
            {data ? `${data.total_results.toLocaleString()} movie${data.total_results === 1 ? '' : 's'}${genre ? ` in ${genre}` : ''}${query ? ` matching “${query}”` : ''}` : 'Loading…'}
          </span>
          <span className="grow" />
          <label className="field no-margin toolbar-sort">
            <span className="sr-only">Sort by</span>
            <select className="input" value={sortBy} onChange={(e) => update({ sort: e.target.value })} aria-label="Sort movies">
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
        </div>

        {loading ? (
          <div role="status" aria-live="polite">
            <span className="sr-only">Loading movies from the dataset…</span>
            <SkeletonGrid count={12} />
          </div>
        ) : null}

        {!loading && error ? <ErrorState error={error} onRetry={() => setLoadKey((k) => k + 1)} /> : null}

        {!loading && !error && data && data.results.length === 0 ? (
          <EmptyState
            icon={<IconSearch size={22} />}
            title="No movies found"
            message={`Nothing matched${query ? ` “${query}”` : ''}${genre ? ` in ${genre}` : ''}. Try a different search term or clear the genre filter.`}
            action={
              <button className="btn btn-primary" onClick={() => setSearchParams({}, { replace: true })}>
                Clear all filters
              </button>
            }
          />
        ) : null}

        {!loading && !error && data && data.results.length > 0 ? (
          <>
            <div className="grid">
              {data.results.map((m) => <MovieCard key={m.movieId} movie={m} />)}
            </div>
            <Pagination page={data.page} totalPages={data.total_pages} onPage={(p) => update({ page: p })} />
          </>
        ) : null}
      </div>
    </div>
  )
}
