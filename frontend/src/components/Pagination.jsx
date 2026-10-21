import { IconArrowLeft, IconArrowRight } from './Icons'

export default function Pagination({ page, totalPages, onPage }) {
  if (!totalPages || totalPages <= 1) return null

  // compact window of page numbers around the current page
  const pages = []
  const push = (p) => { if (p >= 1 && p <= totalPages && !pages.includes(p)) pages.push(p) }
  push(1)
  push(page - 2); push(page - 1); push(page); push(page + 1); push(page + 2)
  push(totalPages)
  pages.sort((a, b) => a - b)

  const items = []
  let prev = 0
  pages.forEach((p) => {
    if (prev && p - prev > 1) items.push(<span key={`gap-${p}`} className="page-info">…</span>)
    items.push(
      <button
        key={p}
        className={`page-btn${p === page ? ' current' : ''}`}
        onClick={() => onPage(p)}
        aria-current={p === page ? 'page' : undefined}
      >
        {p}
      </button>
    )
    prev = p
  })

  return (
    <nav className="pagination" aria-label="Pagination">
      <button className="page-btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <IconArrowLeft size={15} /> Prev
      </button>
      {items}
      <button className="page-btn" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        Next <IconArrowRight size={15} />
      </button>
    </nav>
  )
}
