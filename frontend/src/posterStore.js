/**
 * Shared poster store.
 *
 * The backend already returns a cached `posterUrl` with every movie, so posters
 * that are known show up instantly. Posters that are not cached yet are
 * resolved lazily through ONE batched call to `/api/posters`:
 *
 *   - ids are collected in a short queue and sent together, so a grid of 24
 *     cards produces a single request instead of 24,
 *   - every id is requested at most once (the cache is keyed by movie id),
 *   - a React render never triggers a request on its own - only mounting a
 *     poster component does,
 *   - a movie that genuinely has no poster is remembered as such, while a
 *     failed lookup is retried after a short cooldown,
 *   - failures degrade to `null`, which makes PosterArt fall back to the
 *     generated artwork.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { api } from './api/client'

/** movieId -> poster url (only successful lookups are kept here). */
const cache = new Map()
/** ids that are known to have no poster at all. */
const withoutPoster = new Set()
/** ids whose lookup failed -> id -> timestamp, retried after the cooldown. */
const failed = new Map()
/** ids waiting to be sent to the backend. */
const queued = new Set()
/** store subscribers. */
const listeners = new Set()

let timer = null
let inFlight = false
let notifyTimer = null

const FLUSH_DELAY = 40      // ms - collect all cards of one render
const RETRY_DELAY = 250     // ms - wait a bit before the next batch
const FAILURE_COOLDOWN = 60 // seconds before a failed lookup is tried again

/** Notify subscribers once per tick, so a grid of cards causes one re-render. */
function notify() {
  if (notifyTimer) return
  notifyTimer = setTimeout(() => {
    notifyTimer = null
    listeners.forEach((listener) => listener())
  }, 0)
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

async function flush() {
  timer = null
  if (inFlight) {
    timer = setTimeout(flush, RETRY_DELAY)
    return
  }
  const ids = [...queued]
  queued.clear()
  if (ids.length === 0) return

  inFlight = true
  try {
    const data = await api.posters(ids)
    const urls = (data && data.posters) || {}
    const statuses = (data && data.status) || {}
    ids.forEach((id) => {
      const url = urls[String(id)]
      const status = statuses[String(id)]
      if (typeof url === 'string' && url) {
        cache.set(id, url)
        failed.delete(id)
        withoutPoster.delete(id)
      } else if (status === 'missing') {
        // final: this movie really has no poster
        withoutPoster.add(id)
        failed.delete(id)
      } else {
        // temporary problem - remember it and try again later
        failed.set(id, Date.now())
      }
    })
    notify()
  } catch {
    // Backend unreachable - remember the failure so we do not spam retries.
    ids.forEach((id) => failed.set(id, Date.now()))
    notify()
  } finally {
    inFlight = false
    if (queued.size > 0) timer = setTimeout(flush, RETRY_DELAY)
  }
}

/** Queue one or more movie ids for a batched poster lookup. */
export function requestPosters(ids) {
  const list = Array.isArray(ids) ? ids : [ids]
  const now = Date.now()
  let added = false
  list.forEach((raw) => {
    const id = Number(raw)
    if (!Number.isFinite(id) || id <= 0) return
    if (cache.has(id) || withoutPoster.has(id) || queued.has(id)) return
    const lastFailure = failed.get(id)
    if (lastFailure && now - lastFailure < FAILURE_COOLDOWN * 1000) return
    queued.add(id)
    added = true
  })
  if (added && !timer) timer = setTimeout(flush, FLUSH_DELAY)
}

/** Synchronous poster lookup (may be empty). */
export function getPoster(movieId) {
  const value = cache.get(Number(movieId))
  return typeof value === 'string' && value ? value : null
}

/** Remember a poster that the API already delivered, so it is never re-fetched. */
function seedPoster(movieId, url) {
  const id = Number(movieId)
  if (!Number.isFinite(id) || id <= 0 || !url) return
  if (cache.get(id) === url) return
  cache.set(id, url)
  withoutPoster.delete(id)
  failed.delete(id)
  notify()
}

/**
 * React hook used by PosterArt.
 *
 * Returns the poster url for `movieId` (or the `fallback` that the API already
 * provided) and schedules a batched lookup when the poster is still unknown.
 */
export function usePosterUrl(movieId, fallback = null) {
  const id = Number(movieId)

  const url = useSyncExternalStore(
    subscribe,
    () => getPoster(id),
    () => null,
  )

  useEffect(() => {
    if (!Number.isFinite(id) || id <= 0) return
    if (fallback) {
      // The API already knows this poster - remember it, no lookup needed.
      seedPoster(id, fallback)
      return
    }
    requestPosters([id])
  }, [id, fallback])

  return url || fallback || null
}
