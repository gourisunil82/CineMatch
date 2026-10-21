import { Link } from 'react-router-dom'
import { IconCompass, IconUsers } from '../components/Icons'

/**
 * Static explanation page written for the KTU S5 viva/demo.
 * It mirrors exactly what the backend does, step by step.
 */
export default function HowItWorks() {
  return (
    <div className="page fade-in">
      <div className="container">
        <div className="page-head">
          <h1>How CineMatch Works</h1>
          <p className="subtitle">
            This page explains both recommendation algorithms exactly as they run in the backend,
            so it can be used as a script during the project demonstration.
          </p>
        </div>

        {/* ---------------- Content-based ---------------- */}
        <section className="panel">
          <div className="panel-head">
            <h2>1 · Content-based filtering</h2>
            <span className="score-badge">genre &amp; tag based</span>
          </div>
          <p className="dim-copy">
            The idea: <i>“if you liked this kind of movie, you will like movies with similar
            content”</i>. It looks only at the movie itself — never at other users.
          </p>
          <ol className="steps">
            <li>
              <b>Build a text document for every movie.</b> The real genres from
              <code className="inline"> movies.csv</code> (with <code className="inline">|</code> turned
              into spaces) are concatenated with all user tags for that movie from
              <code className="inline"> tags.csv</code>. Movies with no tags simply keep their genres.
            </li>
            <li>
              <b>TF-IDF vectorisation.</b> Scikit-learn's <code className="inline">TfidfVectorizer</code> turns
              each document into a numeric vector. Words that appear in many movies get a lower weight
              (term frequency × inverse document frequency), so rare, distinctive tags matter more.
            </li>
            <li>
              <b>Cosine similarity, one movie at a time.</b> For a clicked movie the backend computes
              <code className="inline"> cosine_similarity(query_vector, all_movies) </code> — a single
              sparse matrix product. A full 9,742 × 9,742 dense matrix would need ~760 MB, so it is
              deliberately never built; each query takes about 10 ms instead.
            </li>
            <li>
              <b>Return the top-N</b> movies excluding itself, each with its similarity score in
              [0, 1] and the list of shared genres (shown as “% match” on the cards).
            </li>
          </ol>
          <div className="method-banner mt-4">
            <span className="m-icon"><IconCompass size={17} /></span>
            <div>
              <b>Where to see it</b>
              <p>Any movie page's “Similar movies” section. Try <Link to="/movie/1">Toy Story (1995)</Link> — its
              closest match is <i>A Bug's Life</i>, exactly what the notebook produces.</p>
            </div>
          </div>
        </section>

        {/* ---------------- Collaborative ---------------- */}
        <section className="panel">
          <div className="panel-head">
            <h2>2 · User-based collaborative filtering</h2>
            <span className="score-badge violet">rating-pattern based</span>
          </div>
          <p className="dim-copy">
            The idea: <i>“people who rated movies like you did will probably like what they liked”</i>.
            It looks only at rating behaviour — never at genres.
          </p>
          <ol className="steps violet">
            <li>
              <b>Split the data 80/20</b> with <code className="inline">random_state=42</code> — the same
              split as the notebook. Only the 80% training ratings ever build the model, so evaluation
              on the 20% test ratings is leakage-free.
            </li>
            <li>
              <b>Build a sparse user–item matrix</b> (610 users × 9,742 movies) with SciPy
              <code className="inline"> csr_matrix</code>. It is 98.3% empty, so storing it densely would be wasteful.
            </li>
            <li>
              <b>Compute user–user cosine similarity</b> on the training matrix: a 610 × 610 matrix
              where entry (u, v) measures how alike two users' rating patterns are (~3 MB — safe to keep in memory).
            </li>
            <li>
              <b>Predict a rating</b> for a movie the user has not seen: take the ≤ 30 most similar
              users who <i>did</i> rate it, and return their ratings weighted by similarity:
              <br />
              <code className="inline">predicted = Σ(sim × rating) / Σ(sim)</code>, clipped to 0.5–5.0.
              If no neighbour rated it, fall back to the user's own mean (or the global mean of 3.5).
            </li>
            <li>
              <b>Recommend:</b> score every candidate with at least 5 training ratings that the user
              has not rated, then return the highest predicted ratings, cached per user so repeat
              requests are instant and the model is trained only once at startup.
            </li>
          </ol>
          <div className="method-banner violet mt-4">
            <span className="m-icon"><IconUsers size={17} /></span>
            <div>
              <b>Where to see it</b>
              <p>The <Link to="/recommendations">For You</Link> page shows the predicted ratings, the five
              nearest neighbour users and the user's real rating history.</p>
            </div>
          </div>
        </section>

        {/* ---------------- Evaluation ---------------- */}
        <section className="panel">
          <div className="panel-head">
            <h2>3 · Evaluation</h2>
          </div>
          <ol className="steps">
            <li><b>Held-out ratings:</b> 20% of all 100,836 ratings are hidden from the model.</li>
            <li><b>Predict 2,000 of them</b> (fixed seed 42, same as the notebook's EVALUATION_ROWS).</li>
            <li><b>Measure error:</b> MAE = average |predicted − actual|; RMSE = sqrt of the average squared error.</li>
            <li>
              <b>Report honestly:</b> the backend computes this once in a background thread when it
              starts and shows the real values on the <Link to="/insights">ML Insights</Link> page —
              if evaluation has not finished, the page says so instead of showing invented numbers.
            </li>
          </ol>
        </section>

        {/* ---------------- Comparison ---------------- */}
        <section className="panel">
          <div className="panel-head"><h2>4 · The two methods compared</h2></div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th></th><th>Content-based</th><th>Collaborative filtering</th></tr>
              </thead>
              <tbody>
                <tr><td>Input</td><td>Genres + user tags</td><td>User–item ratings</td></tr>
                <tr><td>Core technique</td><td>TF-IDF + cosine similarity</td><td>User–user cosine similarity</td></tr>
                <tr><td>Personalised?</td><td>No — same result for everyone</td><td>Yes — depends on the user</td></tr>
                <tr><td>Cold start</td><td>Works for new movies (only needs metadata)</td><td>Fails for users with no ratings</td></tr>
                <tr><td>Score shown</td><td>Similarity 0–1</td><td>Predicted rating 0.5–5.0</td></tr>
                <tr><td>API route</td><td><code className="inline">/api/recommendations/similar/&#123;id&#125;</code></td><td><code className="inline">/api/recommendations/user/&#123;id&#125;</code></td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ---------------- Limitations ---------------- */}
        <section className="panel">
          <div className="panel-head"><h2>5 · Honest limitations</h2></div>
          <ul className="loose-list">
            <li>The dataset contains <b>no posters or plot summaries</b>, so CineMatch draws posters locally and recommends from genres/tags only.</li>
            <li>Recommendations follow the <b>rating history of dataset users</b> — the app does not create an account or profile for you, and never fabricates ratings.</li>
            <li>User-based CF can be slow on much larger datasets; this MovieLens version (610 users) is ideal for a student project and is precomputed once at startup.</li>
            <li>A user with zero ratings faces the <b>cold-start problem</b> — a production system would ask for a few favourite genres first.</li>
            <li>This is an academic baseline, not a production recommender: no session handling, no A/B testing, no deep models.</li>
          </ul>
        </section>

        {/* ---------------- Architecture ---------------- */}
        <section className="panel">
          <div className="panel-head"><h2>6 · Project architecture</h2></div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Layer</th><th>Tech</th><th>Role</th></tr></thead>
              <tbody>
                <tr>
                  <td>Frontend</td>
                  <td>React 19 + Vite (JavaScript)</td>
                  <td>Six pages; talks to the API through a dev proxy on <code className="inline">/api</code></td>
                </tr>
                <tr>
                  <td>Backend</td>
                  <td>FastAPI + Uvicorn (Python)</td>
                  <td>REST endpoints; models built once at startup, then reused</td>
                </tr>
                <tr>
                  <td>Machine learning</td>
                  <td>pandas, NumPy, scikit-learn, SciPy</td>
                  <td>Same algorithms as the original notebook — ported, not rewritten</td>
                </tr>
                <tr>
                  <td>Data</td>
                  <td>4 MovieLens CSV files</td>
                  <td>Read-only from <code className="inline">data/</code>; never modified</td>
                </tr>
                <tr>
                  <td>Original notebook</td>
                  <td>Jupyter</td>
                  <td><code className="inline">Personalized_Movie_Recommendation.ipynb</code> — kept untouched as the ML report</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
