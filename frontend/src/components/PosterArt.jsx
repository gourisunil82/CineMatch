/**
 * Polished poster art — prefers real poster URLs if provided, otherwise
 * falls back to a refined locally generated gradient with elegant typography.
 * Real posters are resolved in the background by the shared poster store, so
 * broken or missing images always degrade to the generated artwork.
 */

import { useEffect, useState } from 'react'
import { usePosterUrl } from '../posterStore'

const GENRE_HUE = {
  Action: 6, Adventure: 28, Animation: 52, Children: 198, Comedy: 58,
  Crime: 356, Documentary: 128, Drama: 262, Fantasy: 286, 'Film-Noir': 226,
  Horror: 342, Musical: 304, Mystery: 272, Romance: 326, 'Sci-Fi': 186,
  Thriller: 168, War: 98, Western: 24, IMAX: 208,
}

function hashId(id) {
  let h = (Number(id) || 1) * 131542391
  h = ((h >> 13) ^ h) * 0x5bd1e995
  h = (h >> 15) ^ h
  return ((h % 360) + 360) % 360
}

function posterStyle(movie) {
  const genres = (movie.genres || '')
    .split('|')
    .filter((g) => g && g !== '(no genres listed)')
  const hues = genres.map((g) => GENRE_HUE[g]).filter((h) => h !== undefined)
  const base = hues.length ? hues.reduce((a, b) => a + b, 0) / hues.length : hashId(movie.movieId) % 360
  const seed = hashId(movie.movieId)
  const h1 = Math.round(base)
  const h2 = Math.round((base + 38 + (seed % 24)) % 360)
  const hMid = ((h1 + h2) / 2) | 0
  return {
    backgroundImage: [
      'radial-gradient(120% 80% at 12% -10%, hsl(' + h1 + ' 72% 42% / 0.5), transparent 64%)',
      'radial-gradient(90% 65% at 110% 110%, hsl(' + h2 + ' 68% 34% / 0.38), transparent 62%)',
      'linear-gradient(165deg, hsl(' + h1 + ' 58% 26%) 0%, hsl(' + hMid + ' 52% 16%) 58%, hsl(' + h2 + ' 62% 12%) 100%)',
    ].join(', '),
  }
}

function monogram(title) {
  const clean = (title || '?').replace(/\(\d{4}\)\s*$/, '').trim()
  const words = clean.split(/[\s,:;/\-\[\]]+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) {
    const w = words[0].replace(/[^A-Za-z0-9]/g, '')
    return (w.slice(0, 2) || '?').toUpperCase()
  }
  const w1 = words[0].replace(/[^A-Za-z0-9]/g, '')
  const w2 = words[1].replace(/[^A-Za-z0-9]/g, '')
  const m = (w1[0] || '') + (w2[0] || '')
  return (m || '?').toUpperCase()
}

function firstTag(movie) {
  const g = (movie.genres || '').split('|').filter((x) => x && x !== '(no genres listed)')
  return g[0] || 'Movie'
}

function getPosterUrl(movie) {
  if (!movie) return null
  const candidates = [
    movie.posterUrl,
    movie.poster_url,
    movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
    movie.poster ? (typeof movie.poster === 'string' && movie.poster.startsWith('http') ? movie.poster : null) : null,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return null
}

export default function PosterArt({ movie, small = false }) {
  const [imgFailed, setImgFailed] = useState(false)
  const apiPosterUrl = getPosterUrl(movie)
  // The store resolves posters that the API could not serve from its cache.
  const posterUrl = usePosterUrl(movie?.movieId, apiPosterUrl)
  const showImage = posterUrl && !imgFailed

  // A different image deserves a fresh attempt.
  useEffect(() => { setImgFailed(false) }, [posterUrl])

  return (
    <div
      className={`poster-art${small ? ' small' : ''}${showImage ? ' has-image' : ''}`}
      style={showImage ? {} : posterStyle(movie)}
      role="img"
      aria-label={`Poster for ${movie?.title || 'movie'}`}
    >
      {showImage ? (
        <img
          className="poster-art-img"
          src={posterUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <>
          {!small && <div className="pa-tag">{firstTag(movie)}</div>}
          <div className="pa-letter">{monogram(movie?.title)}</div>
          {!small && (
            <div className="pa-bottom">
              <div className="pa-title">{movie?.title}</div>
              {movie?.year ? <div className="pa-year">{movie.year}</div> : null}
            </div>
          )}
        </>
      )}
    </div>
  )
}
