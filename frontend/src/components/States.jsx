import { IconFilm, IconAlert } from './Icons'

export function Spinner({ label = 'Loading…', small = false }) {
  return (
    <div className="loading-block" role="status" aria-live="polite">
      <div className={`spinner${small ? ' small' : ''}`} />
      <p>{label}</p>
    </div>
  )
}

/**
 * Skeleton placeholder grid shown while movie data loads,
 * so the layout never jumps between loading and content.
 */
export function SkeletonGrid({ count = 12, wide = false }) {
  return (
    <div className={`grid${wide ? ' wide' : ''}`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div className="skeleton-card" key={i}>
          <div className="skeleton-poster shimmer" />
          <div className="skeleton-line shimmer" />
          <div className="skeleton-line short shimmer" />
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ icon, title, message, action }) {
  return (
    <div className="empty-state">
      <div className="es-icon" aria-hidden="true">{icon ?? <IconFilm size={22} />}</div>
      <h3>{title}</h3>
      {message ? <p>{message}</p> : null}
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="error-box" role="alert">
      <span className="eb-icon" aria-hidden="true"><IconAlert size={18} /></span>
      <div className="eb-body">
        <b>Something went wrong</b>
        {error}
        {onRetry ? (
          <div className="mt-3">
            <button className="btn btn-sm" onClick={onRetry}>Try again</button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
