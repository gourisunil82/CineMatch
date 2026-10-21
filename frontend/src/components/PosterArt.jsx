/**
 * Locally generated poster art — no network requests, no broken images.
 *
 * The MovieLens dataset contains no poster URLs, so every movie gets a
 * deterministic gradient: the hue is derived from the movie's real genres
 * (each genre has a fixed colour) with a small offset seeded by the movieId.
 * The same movie therefore always shows the same poster.
 */

const GENRE_HUE = {
  Action: 5, Adventure: 32, Animation: 48, Children: 200, Comedy: 55,
  Crime: 0, Documentary: 120, Drama: 262, Fantasy: 285, 'Film-Noir': 222,
  Horror: 340, Musical: 300, Mystery: 268, Romance: 322, 'Sci-Fi': 178,
  Thriller: 158, War: 92, Western: 26, IMAX: 205,
}

function hashId(id) {
  // small deterministic hash so posters vary by movie
  let h = (Number(id) || 1) * 2654435761
  h = h % 360
  return h
}

function posterStyle(movie) {
  const genres = (movie.genres || '')
    .split('|')
    .filter((g) => g && g !== '(no genres listed)')
  const hues = genres.map((g) => GENRE_HUE[g]).filter((h) => h !== undefined)
  const base = hues.length ? hues.reduce((a, b) => a + b, 0) / hues.length : hashId(movie.movieId) % 360
  const seed = hashId(movie.movieId)
  const h1 = Math.round(base)
  const h2 = Math.round((base + 40 + (seed % 30)) % 360)
  const hMid = ((h1 + h2) / 2) | 0
  return {
    // layered composition: soft key light top-left, deep base gradient,
    // and a faint rim of the secondary hue on the right edge
    backgroundImage: [
      'radial-gradient(115% 70% at 18% -8%, hsl(' + h1 + ' 62% 38% / 0.55), transparent 62%)',
      'radial-gradient(85% 55% at 105% 105%, hsl(' + h2 + ' 65% 32% / 0.4), transparent 60%)',
      'linear-gradient(155deg, hsl(' + h1 + ' 52% 24%) 0%, hsl(' + hMid + ' 48% 15%) 55%, hsl(' + h2 + ' 58% 10%) 100%)',
    ].join(', '),
  }
}

function monogram(title) {
  const clean = (title || '?').replace(/\(\d{4}\)\s*$/, '').trim()
  const words = clean.split(/[\s,:]+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

function firstTag(movie) {
  const g = (movie.genres || '').split('|').filter((x) => x && x !== '(no genres listed)')
  return g[0] || 'Movie'
}

export default function PosterArt({ movie, small = false }) {
  return (
    <div
      className={`poster-art${small ? ' small' : ''}`}
      style={posterStyle(movie)}
      role="img"
      aria-label={`Poster placeholder for ${movie.title}`}
    >
      {!small && <div className="pa-tag">{firstTag(movie)}</div>}
      <div className="pa-letter">{monogram(movie.title)}</div>
      {!small && (
        <div className="pa-bottom">
          <div className="pa-title">{movie.title}</div>
          {movie.year ? <div className="pa-year">{movie.year}</div> : null}
        </div>
      )}
    </div>
  )
}
