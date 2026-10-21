import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, errorMessage } from '../api/client'
import MovieCard from '../components/MovieCard'
import { Spinner, EmptyState, ErrorState } from '../components/States'
import { IconUsers, IconStar } from '../components/Icons'

/**
 * Personalised recommendations screen.
 * Everything shown here comes from user-based collaborative filtering on the
 * real rating data: the prediction model, neighbour list and rating history
 * are three separate API calls that always identify their method.
 */
export default function Recommendations() {
  const navigate = useNavigate()
  const [samples, setSamples] = useState([])
  const [userId, setUserId] = useState('')
  const [input, setInput] = useState('')
  const [data, setData] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [loadKey, setLoadKey] = useState(0)

  // load a few real user ids for the dropdown
  useEffect(() => {
    api.sampleUsers()
      .then((d) => {
        setSamples(d.users || [])
        if (d.users && d.users.length && !userId) {
          setUserId(String(d.users[2]?.userId || d.users[0].userId))
        }
      })
      .catch(() => setSamples([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchUser = useCallback((uid) => {
    setLoading(true)
    setError(null)
    setData(null)
    setHistory(null)
    Promise.all([api.userRecs(uid, 12), api.history(uid, 10)])
      .then(([recs, hist]) => { setData(recs); setHistory(hist.results || []) })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (userId) fetchUser(userId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, loadKey])

  const submit = (e) => {
    e.preventDefault()
    const raw = input.trim()
    if (!raw) { setError('Please enter a user id, for example 15.'); return }
    if (!/^\d+$/.test(raw)) { setError(`"${raw}" is not a number. User ids are whole numbers from 1 to 610.`); return }
    const n = Number(raw)
    if (n < 1 || n > 610) { setError(`User id ${n} is out of range. Valid ids are 1 to 610 — try one of the suggestions below.`); return }
    setUserId(String(n))
    setError(null)
  }

  return (
    <div className="page fade-in">
      <div className="container">
        <div className="page-head">
          <h1>For You</h1>
          <p className="subtitle">
            Personalised picks computed by <b>user-based collaborative filtering</b>: the model
            compares your rating pattern with 610 real users and predicts how you would rate
            movies you have not seen yet. Nothing here is randomised.
          </p>
        </div>

        <div className="two-col">
          <aside>
            <div className="panel">
              <div className="panel-head"><h3>Choose a user</h3></div>
              <p className="panel-note">
                Recommendations depend on real rating history, so pick one of the 610 users in the
                dataset (there is no sign-up system — see <a href="#persistence-note">persistence note</a> below).
              </p>
              <label className="field">
                <span>Sample users across activity levels</span>
                <select
                  className="input"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  disabled={samples.length === 0}
                >
                  {samples.map((u) => (
                    <option key={u.userId} value={u.userId}>
                      User {u.userId} — {u.ratings_given} ratings
                    </option>
                  ))}
                  {samples.length === 0 ? <option>Loading users…</option> : null}
                </select>
              </label>
              <form onSubmit={submit}>
                <label className="field">
                  <span>Or enter a user id (1–610)</span>
                  <div className="inline-row">
                    <input
                      className="input"
                      inputMode="numeric"
                      placeholder="e.g. 15"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                    />
                    <button className="btn btn-primary" type="submit">Go</button>
                  </div>
                </label>
              </form>

              <div className="notice" id="persistence-note">
                <b>Watchlist & favourites</b> are stored in this
                browser only (localStorage). Your rating <i>history</i> comes from the dataset — the
                app never invents a profile for you.
              </div>
            </div>

            {data && data.neighbours && data.neighbours.length > 0 ? (
              <div className="panel">
                <div className="panel-head">
                  <h3>Nearest neighbours</h3>
                </div>
                <p className="panel-note">
                  The most similar users (cosine similarity of their rating vectors) whose tastes
                  drive this user's predictions:
                </p>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr><th>User</th><th>Similarity</th><th>Ratings</th></tr>
                    </thead>
                    <tbody>
                      {data.neighbours.map((n) => (
                        <tr key={n.userId}>
                          <td>#{n.userId}</td>
                          <td className="num">{n.similarity.toFixed(3)}</td>
                          <td className="num">{n.ratings_given}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </aside>

          <main>
            <div className="method-banner violet">
              <span className="m-icon"><IconUsers size={17} /></span>
              <div>
                <b>Collaborative Filtering · Personalised Picks</b>
                <p>
                  {data
                    ? `Predicted for User ${data.user_id}, who rated ${data.ratings_given} movies. Already-rated titles are excluded — each card shows the predicted rating (0.5–5.0).`
                    : 'Predicts how you might rate candidate movies based on similar users’ tastes.'}
                </p>
              </div>
            </div>

            {loading ? <Spinner label="Computing predictions from the rating matrix…" /> : null}

            {!loading && error ? <ErrorState error={error} onRetry={() => setLoadKey((k) => k + 1)} /> : null}

            {!loading && !error && data && data.results.length === 0 ? (
              <EmptyState
                icon={<IconUsers size={22} />}
                title="No recommendations available"
                message="This user has rated so many movies that nothing new qualifies as a candidate."
              />
            ) : null}

            {!loading && !error && data && data.results.length > 0 ? (
              <div className="grid wide">
                {data.results.map((m) => (
                  <MovieCard
                    key={m.movieId}
                    movie={m}
                    extra={<span className="score-badge violet"><IconStar size={11} /> {m.predicted_rating.toFixed(2)} predicted</span>}
                  />
                ))}
              </div>
            ) : null}

            <section className="panel mt-5">
              <div className="panel-head">
                <h3>Rating history of this user</h3>
                <span className="score-badge">real dataset values</span>
              </div>
              {loading ? <Spinner small label="" /> : null}
              {!loading && history && history.length > 0 ? (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr><th>Movie</th><th>Genres</th><th>Rating</th></tr>
                    </thead>
                    <tbody>
                      {history.map((h) => (
                        <tr key={h.movieId} className="clickable" onClick={() => navigate(`/movie/${h.movieId}`)}>
                          <td>{h.title}</td>
                          <td className="faint">{h.genres.replaceAll('|', ', ')}</td>
                          <td className="num"><span className="rating-pill"><IconStar size={12} /> {h.rating.toFixed(1)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {!loading && history && history.length === 0 ? (
                <div className="notice">This user has no ratings in the dataset.</div>
              ) : null}
            </section>
          </main>
        </div>
      </div>
    </div>
  )
}
