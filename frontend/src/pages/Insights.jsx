import { useEffect, useState } from 'react'
import { api, errorMessage } from '../api/client'
import { Spinner, ErrorState } from '../components/States'

function Bars({ rows, labelKey, valueKey, violet = false, format }) {
  const max = Math.max(...rows.map((r) => r[valueKey]), 1)
  return (
    <div className="bar-chart">
      {rows.map((r) => (
        <div className="bar-row" key={r[labelKey]}>
          <span className="bar-label" title={String(r[labelKey])}>{r[labelKey]}</span>
          <div className="bar-track">
            <div
              className={`bar-fill${violet ? ' violet' : ''}`}
              style={{ width: `${Math.max(2, (r[valueKey] / max) * 100)}%` }}
            />
          </div>
          <span className="bar-value">{format ? format(r[valueKey]) : r[valueKey]}</span>
        </div>
      ))}
    </div>
  )
}

export default function Insights() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [loadKey, setLoadKey] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    api.stats()
      .then((d) => { if (alive) setStats(d) })
      .catch((e) => { if (alive) setError(errorMessage(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [loadKey])

  if (loading) return <div className="container page"><Spinner label="Crunching the real dataset…" /></div>
  if (error) return <div className="container page"><ErrorState error={error} onRetry={() => setLoadKey((k) => k + 1)} /></div>

  const { dataset: d, models: m, rating_distribution: dist, top_genres: genres, movies_by_decade: decades, activity } = stats
  const evalData = m.evaluation || {}
  const evalComputed = evalData.status === 'computed'

  return (
    <div className="page fade-in">
      <div className="container">
        <div className="page-head">
          <h1>Machine Learning Insights</h1>
          <p className="subtitle">
            Every number on this page is computed live from the four MovieLens CSV files —
            the same data your notebook reads. Re-run <code className="inline">Personalized_Movie_Recommendation.ipynb</code> to reproduce them.
          </p>
        </div>

        {/* ---- dataset overview ---- */}
        <div className="stat-grid">
          <div className="stat-card"><b>{d.n_movies.toLocaleString()}</b><span>movies</span></div>
          <div className="stat-card"><b>{d.n_ratings.toLocaleString()}</b><span>ratings</span></div>
          <div className="stat-card"><b>{d.n_users}</b><span>users</span></div>
          <div className="stat-card"><b>{d.n_tags.toLocaleString()}</b><span>user tags</span></div>
          <div className="stat-card"><b>{d.n_genres}</b><span>genres</span></div>
          <div className="stat-card"><b>{d.rating_mean.toFixed(2)}</b><span>mean rating ({d.rating_min}–{d.rating_max})</span></div>
          <div className="stat-card"><b>{(d.sparsity * 100).toFixed(1)}%</b><span>matrix sparsity</span></div>
          <div className="stat-card"><b>{d.movies_with_tags.toLocaleString()}</b><span>movies with tags</span></div>
        </div>

        {/* ---- evaluation metrics (all four describe the collaborative model → violet) ---- */}
        <section className="panel mt-5">
          <div className="panel-head">
            <h2>Model evaluation — held-out test set</h2>
            <span className={`score-badge${evalComputed ? ' violet' : ''}`}>
              {evalComputed ? 'collaborative filtering · evaluated' : evalData.status || 'pending'}
            </span>
          </div>

          {evalComputed ? (
            <>
              <div className="metric-grid">
                <div className="metric-card violet">
                  <b>{evalData.mae.toFixed(4)}</b>
                  <span>MAE (mean absolute error)</span>
                  <small>predictions are, on average, {evalData.mae.toFixed(2)} stars off</small>
                </div>
                <div className="metric-card violet">
                  <b>{evalData.rmse.toFixed(4)}</b>
                  <span>RMSE (root mean squared error)</span>
                  <small>penalises large misses more heavily</small>
                </div>
                <div className="metric-card violet">
                  <b>{evalData.evaluated_ratings.toLocaleString()}</b>
                  <span>held-out ratings evaluated</span>
                  <small>{Math.round(evalData.test_size * 100)}% test split · seed {evalData.random_state}</small>
                </div>
                <div className="metric-card violet">
                  <b>{evalData.k_neighbours}</b>
                  <span>k nearest neighbours</span>
                  <small>user-user cosine similarity</small>
                </div>
              </div>
              <div className="notice mt-4">
                <b>No data leakage:</b> {evalData.split}. Ratings
                used for evaluation were never used to build the model. These values are calculated
                when the backend starts — they are not hard-coded.
              </div>
            </>
          ) : (
            <div className="notice">
              <b>Metrics not available yet.</b>{' '}
              {evalData.note || 'The background evaluation has not finished. Refresh in a moment or restart the backend.'}
              {evalData.error ? <div className="error-line">Error: {evalData.error}</div> : null}
              <div className="mt-3">
                <button className="btn btn-sm" onClick={() => setLoadKey((k) => k + 1)}>Check again</button>
              </div>
            </div>
          )}
        </section>

        <div className="two-col mt-5">
          <section className="panel">
            <div className="panel-head"><h3>Rating distribution</h3></div>
            <Bars rows={dist} labelKey="rating" valueKey="count" format={(v) => v.toLocaleString()} />
            <p className="list-foot">
              Real values, 0.5 → 5.0 in 0.5 steps.
            </p>
          </section>

          <section className="panel">
            <div className="panel-head"><h3>Top genres</h3></div>
            <Bars rows={genres} labelKey="genre" valueKey="movie_count" format={(v) => v.toLocaleString()} />
          </section>
        </div>

        <div className="two-col mt-5">
          <section className="panel">
            <div className="panel-head"><h3>Movies per decade</h3></div>
            <Bars rows={decades} labelKey="decade" valueKey="movie_count" format={(v) => v.toLocaleString()} />
          </section>

          <section className="panel">
            <div className="panel-head"><h3>Activity & data quality</h3></div>
            <div className="table-wrap">
              <table className="data">
                <tbody>
                  <tr><td>Ratings per movie (mean)</td><td className="num">{activity.ratings_per_movie_mean}</td></tr>
                  <tr><td>Ratings per movie (median)</td><td className="num">{activity.ratings_per_movie_median}</td></tr>
                  <tr><td>Most rated movie</td><td>{activity.most_rated_movie.title} ({activity.most_rated_movie.count})</td></tr>
                  <tr><td>Ratings per user (min / median / max)</td><td className="num">{activity.ratings_per_user_min} / {activity.ratings_per_user_median} / {activity.ratings_per_user_max}</td></tr>
                  <tr><td>Missing values (movies / ratings / tags)</td><td className="num">{d.missing_values.movies} / {d.missing_values.ratings} / {d.missing_values.tags}</td></tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* ---- model architecture ---- */}
        <section className="panel mt-5">
          <div className="panel-head"><h2>The two models behind CineMatch</h2></div>
          <div className="two-col">
            <div>
              <span className="score-badge">content-based</span>
              <p className="method-copy">{m.content_based.method}</p>
              <div className="table-wrap">
                <table className="data">
                  <tbody>
                    <tr><td>Feature matrix</td><td className="num">{m.content_based.feature_matrix_shape.join(' × ')}</td></tr>
                    <tr><td>TF-IDF terms</td><td className="num">{m.content_based.vocabulary_size.toLocaleString()}</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="list-foot">{m.content_based.notes}</p>
            </div>
            <div>
              <span className="score-badge violet">collaborative filtering</span>
              <p className="method-copy">{m.collaborative.method}</p>
              <div className="table-wrap">
                <table className="data">
                  <tbody>
                    <tr><td>Train / test ratings</td><td className="num">{m.collaborative.train_ratings.toLocaleString()} / {m.collaborative.test_ratings.toLocaleString()}</td></tr>
                    <tr><td>User-item matrix</td><td className="num">{m.collaborative.user_item_matrix_shape.join(' × ')}</td></tr>
                    <tr><td>Matrix density</td><td className="num">{(m.collaborative.matrix_density * 100).toFixed(3)}%</td></tr>
                    <tr><td>Global mean rating</td><td className="num">{m.collaborative.global_mean_rating}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
