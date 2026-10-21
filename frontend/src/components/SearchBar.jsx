import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { IconSearch, IconClose } from './Icons'

/**
 * Search box with debounced title suggestions from GET /api/search/suggest.
 * Submitting the form performs a full search (the Home page reads the query).
 */
export default function SearchBar({ value, onChange, onSubmit, placeholder = 'Search movies by title…', autoFocus = false }) {
  const navigate = useNavigate()
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const boxRef = useRef(null)
  const timerRef = useRef(null)

  // debounce: wait 250 ms after the last keystroke before calling the API
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const q = (value || '').trim()
    if (q.length < 2) {
      setSuggestions([])
      return
    }
    timerRef.current = setTimeout(() => {
      api.suggest(q)
        .then((data) => { setSuggestions(data.suggestions || []); setOpen(true) })
        .catch(() => setSuggestions([]))
    }, 250)
    return () => clearTimeout(timerRef.current)
  }, [value])

  // close when clicking outside
  useEffect(() => {
    const handler = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const pick = (movie) => { setOpen(false); navigate(`/movie/${movie.movieId}`) }

  const handleKey = (e) => {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => (h + 1) % suggestions.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length) }
    else if (e.key === 'Enter' && highlight >= 0) { e.preventDefault(); pick(suggestions[highlight]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  const submit = (e) => {
    e.preventDefault()
    setOpen(false)
    if (onSubmit) onSubmit(value)
  }

  return (
    <form className="search-wrap" ref={boxRef} onSubmit={submit} role="search">
      <span className="search-icon" aria-hidden="true"><IconSearch size={18} /></span>
      <input
        className="input search-input"
        type="text"
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label="Search movies"
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => { if (suggestions.length) setOpen(true) }}
        onKeyDown={handleKey}
      />
      {value ? (
        <button type="button" className="search-clear" aria-label="Clear search" onClick={() => { onChange(''); setSuggestions([]); onSubmit('') }}>
          <IconClose size={14} />
        </button>
      ) : null}
      {open && suggestions.length > 0 ? (
        <div className="suggestions" role="listbox">
          {suggestions.map((s, i) => (
            <button
              type="button"
              key={s.movieId}
              className={`suggestion${i === highlight ? ' focused' : ''}`}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => pick(s)}
            >
              <span className="s-title">{s.title}</span>
              <span className="s-meta">{(s.genres || '').split('|')[0]}</span>
            </button>
          ))}
        </div>
      ) : null}
    </form>
  )
}
