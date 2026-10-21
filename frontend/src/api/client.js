/**
 * Thin fetch wrapper around the CineMatch backend.
 * All requests go to /api/... ; during development Vite proxies them to :8000.
 */
const BASE = '/api'

async function request(path, params) {
  const url = new URL(BASE + path, window.location.origin)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value))
      }
    })
  }

  let response
  try {
    response = await fetch(url.toString())
  } catch {
    throw new Error(
      'Could not reach the CineMatch server. Make sure the backend is running (python run.py in the backend folder).'
    )
  }

  let data = null
  try {
    data = await response.json()
  } catch {
    /* empty body */
  }

  if (!response.ok) {
    const message =
      data && data.detail ? data.detail : `Request failed (HTTP ${response.status}). Please try again.`
    const error = new Error(message)
    error.status = response.status
    throw error
  }
  return data
}

export const api = {
  health: () => request('/health'),
  genres: () => request('/genres'),
  movies: (opts = {}) => request('/movies', opts),
  suggest: (q) => request('/search/suggest', { q }),
  movie: (id) => request(`/movies/${id}`),
  similar: (id, n = 12) => request(`/recommendations/similar/${id}`, { n }),
  userRecs: (id, n = 12) => request(`/recommendations/user/${id}`, { n }),
  history: (id, n = 15) => request(`/users/${id}/history`, { n }),
  sampleUsers: () => request('/users/sample'),
  stats: () => request('/stats'),
  /** Batch poster lookup by MovieLens movie id. */
  posters: (ids = []) => request('/posters', { ids: ids.join(',') }),
}

/** Extract a user-friendly message from any thrown error. */
export function errorMessage(err) {
  return err && err.message ? err.message : 'Something went wrong. Please try again.'
}
