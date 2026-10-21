import { useEffect, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { api } from '../api/client'
import { IconFilm, IconMenu, IconClose } from './Icons'

const LINKS = [
  { to: '/', label: 'Discover', end: true },
  { to: '/recommendations', label: 'For You' },
  { to: '/watchlist', label: 'Library' },
  { to: '/insights', label: 'ML Insights' },
  { to: '/how-it-works', label: 'How It Works' },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('checking') // checking | online | offline
  const headerRef = useRef(null)

  useEffect(() => {
    let alive = true
    const check = () =>
      api.health()
        .then(() => alive && setStatus('online'))
        .catch(() => alive && setStatus('offline'))
    check()
    const id = setInterval(check, 30000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  // close the mobile menu when tapping outside the header
  useEffect(() => {
    if (!open) return undefined
    const handler = (e) => {
      if (headerRef.current && !headerRef.current.contains(e.target)) setOpen(false)
    }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <header className="nav" ref={headerRef}>
      <div className="container">
        <Link to="/" className="brand" onClick={() => setOpen(false)}>
          <span className="brand-mark" aria-hidden="true"><IconFilm size={17} /></span>
          <span>Cine<em>Match</em></span>
        </Link>

        <button
          className="nav-burger"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <IconClose size={19} /> : <IconMenu size={19} />}
        </button>

        <nav className={`nav-links${open ? ' open' : ''}`} aria-label="Main navigation">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              onClick={() => setOpen(false)}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <span
          className={`status-dot ${status === 'checking' ? '' : status}`}
          title={
            status === 'online'
              ? 'Connected to the CineMatch API'
              : status === 'offline'
                ? 'Backend not reachable — start it with: python run.py'
                : 'Checking backend…'
          }
          aria-label={`Backend status: ${status}`}
        />
      </div>
    </header>
  )
}
