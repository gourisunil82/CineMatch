# CineMatch — Personalized Movie Recommendation System

**KTU S5 Machine Learning project** turned into a full-stack web application.

CineMatch is a responsive movie-discovery web app that recommends movies two different ways —
**content-based filtering** (genres + user tags with TF-IDF and cosine similarity) and
**user-based collaborative filtering** (real user–item rating patterns) — both computed live
from the original MovieLens dataset used in the project notebook.

### Group members
- Chris Maria Shajan C — CCE24CS069
- Chandana T D — CCE24CS068
- Gouri Sunil — CCE24CS092
- Gesmi Geenson — CCE24CS089

---

## Contents

| Path | What it is |
|---|---|
| `Personalized_Movie_Recommendation.ipynb` | The original ML notebook — **unchanged**, still runs as before |
| `data/` | The original MovieLens CSV files — **unchanged, read-only** |
| `outputs/` | Example recommendation CSVs produced by the notebook |
| `requirements.txt` | Dependencies for the notebook |
| `backend/` | FastAPI REST API that reuses the notebook's algorithms |
| `frontend/` | React + Vite single-page app (the CineMatch interface) |
| `README.md` | This file |

## Features

- 🎬 Cinematic dark UI (navy/charcoal with teal + violet accents), fully responsive desktop → mobile
- 🔍 Real-time movie search with title suggestions, genre filters, sorting, pagination
- 🧭 **Content-based similar movies** — TF-IDF over genres & tags, cosine similarity per query
- 🤝 **Personalised recommendations** — user–user collaborative filtering on real ratings, with neighbour explanation and rating history
- 📄 Movie detail pages with real average rating, rating count, user tags, IMDb/TMDB links
- 📌 Watchlist & favourites persisted in the browser (localStorage) — behaviour clearly explained in the UI
- 📊 ML Insights page with **real dataset statistics** and **actually computed MAE/RMSE**
- ✅ Loading indicators, empty states, input validation, understandable error messages
- 🖼️ Locally generated poster art (the dataset contains no poster images, so nothing is ever broken)

---

## Quick start on Windows (VS Code)

You need **Python 3.10+** and **Node.js 18+** (you already have Python 3.13 and Node 22).

### Step 1 — Open the right folder

Open **this** folder (the one containing `README.md`, `backend`, `frontend`, `data`) in VS Code:
`...\Downloads\KTU_Movie_Recommendation_Project\KTU_Movie_Recommendation_Project`

### Step 2 — Start the backend (terminal 1)

In the VS Code terminal (`Ctrl + `` `):

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe run.py
```

You should see:

```text
[CineMatch] Loaded 9742 movies, 610 users, 100836 ratings from ...\data
INFO: Uvicorn running on http://127.0.0.1:8000
```

> If PowerShell blocks `.\.venv\Scripts\Activate.ps1`, don't worry — calling
> `.\.venv\Scripts\python.exe` directly works without activation.

The models are built **once at startup** (a few seconds). A background thread then evaluates
the model on held-out ratings and the ML Insights page shows the real metrics.

### Step 3 — Start the frontend (terminal 2)

Click the **+** in the VS Code terminal panel to open a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

### Stopping / restarting

- Stop both servers with `Ctrl + C` in each terminal.
- The backend must be running for the site to show data — the small green dot in the
  navbar tells you it is connected (red = backend not reachable).

---

## Architecture

```text
Browser  ──►  React + Vite (port 5173)
                  │  every request to /api/... is proxied (vercel.json does this in production)
                  ▼
             FastAPI (port 8000)
                  │  models built ONCE at startup, then reused — never retrained per request
                  ▼
             pandas / scikit-learn / SciPy
                  ▼
             data/movies.csv, ratings.csv, tags.csv, links.csv   (read-only)
```

### Backend layout

```text
backend/
├── run.py                 # one-command server start
├── requirements.txt
└── app/
    ├── main.py            # FastAPI app, startup loading, background evaluation
    ├── config.py          # dataset path resolution + shared settings
    ├── schemas.py         # Pydantic response models (nice /docs page)
    ├── api/routes.py      # all endpoints
    └── ml/
        ├── data_loader.py     # loads & validates the 4 CSVs (notebook Steps 1–3)
        ├── content_based.py   # TF-IDF + cosine similarity (notebook Steps 5–6)
        ├── collaborative.py   # user-user CF, prediction, recommendations (Steps 7–8, 10–11)
        ├── evaluation.py      # held-out MAE / RMSE (Steps 7, 9)
        └── stats.py           # real dataset statistics (Steps 2–4)
```

### Frontend layout

```text
frontend/src/
├── App.jsx                # routes for the 6 pages
├── api/client.js          # fetch wrapper with friendly error messages
├── context/WatchlistContext.jsx   # watchlist + favourites (localStorage)
├── components/            # Navbar, MovieCard, PosterArt, SearchBar, Pagination, states…
├── pages/                 # Home, MovieDetail, Recommendations, Watchlist, Insights, HowItWorks
└── styles/global.css      # the whole design system
```

---

## API reference

Base URL: `http://127.0.0.1:8000` · Interactive docs: **http://127.0.0.1:8000/docs**

| Endpoint | Parameters | Returns |
|---|---|---|
| `GET /api/health` | — | status, dataset info, evaluation status |
| `GET /api/movies` | `q`, `genre`, `sort_by` (`popularity\|rating\|year\|title`), `min_ratings`, `page`, `page_size` | paginated movies with **real** avg rating & count |
| `GET /api/movies/{movie_id}` | — | full detail: genres, year, rating aggregate, top tags, IMDb/TMDB ids |
| `GET /api/recommendations/similar/{movie_id}` | `n` | **content-based** results with similarity scores |
| `GET /api/recommendations/user/{user_id}` | `n` | **collaborative** results with predicted ratings + neighbours |
| `GET /api/stats` | — | dataset statistics + real MAE/RMSE (when computed) |
| `GET /api/genres` | — | every genre with movie count |
| `GET /api/users/sample` | — | 5 real user ids across activity levels |
| `GET /api/users/{user_id}/history` | `n` | that user's real highest-rated movies |
| `GET /api/search/suggest` | `q`, `limit` | fast title suggestions |

Unknown movie ids and user ids return **404 with a clear explanation** (valid ranges are included).

---

## How the algorithms work

Both methods from the notebook are reused in `backend/app/ml/`; the notebook itself was never modified.

### 1 · Content-based filtering (`GET /api/recommendations/similar/{id}`)

1. **Document per movie** = genres from `movies.csv` (with `|` → space) concatenated with all
   user tags for that movie from `tags.csv`. Movies without tags keep their genres.
2. **TF-IDF** (`TfidfVectorizer(stop_words="english")`) converts each document into a numeric
   vector; rare, distinctive tags get more weight than common words.
3. **Cosine similarity is computed for one movie at a time**
   (`cosine_similarity(vector[i], matrix)`) — the full 9,742 × 9,742 dense matrix
   (~760 MB) is deliberately **never built**; a query takes ~10 ms.
4. The top-N neighbours are returned with their score in `[0, 1]` and shared genres.
   The UI shows this as a “% match”.

*Same movie, same numbers as the notebook: for **Toy Story (1995)** the top result is
**A Bug's Life (1998)** with similarity **0.8622**, matching `outputs/content_based_example.csv`.*

### 2 · User-based collaborative filtering (`GET /api/recommendations/user/{id}`)

1. **80/20 train/test split** with `random_state = 42` (identical to the notebook).
   Only training ratings build the model — no data leakage.
2. A **sparse user–item matrix** (610 × 9,742, 98.3 % empty) is built with SciPy `csr_matrix`.
3. **User–user cosine similarity** on the training matrix gives a 610 × 610 matrix (~3 MB).
4. **Prediction** for user *u* and movie *m*:
   take the ≤ 30 most similar users who rated *m*, then

   ```text
   predicted(u, m) = Σ similarity(u, v) × rating(v, m)  /  Σ similarity(u, v)
   ```

   clipped to the MovieLens range 0.5–5.0. Fallbacks: the user's own mean → global mean.
5. **Recommendation**: score every candidate movie with ≥ 5 training ratings that the user has
   not rated, sort by predicted rating, cache per user.

### 3 · Evaluation without leakage (`GET /api/stats` → ML Insights page)

- 20 % of the 100,836 ratings are held out; the model only sees the other 80 %.
- 2,000 held-out ratings are predicted (seed 42, `k = 30`, same protocol as the notebook).
- **MAE** = mean |predicted − actual|, **RMSE** = √(mean squared error).
- Evaluation runs **in a background thread at backend startup**. Until it finishes,
  `/api/stats` honestly reports `"status": "not_computed"` and the UI shows *no numbers*
  — metrics are never invented or hard-coded.

**Values observed from a local run of this project** (record your own from your machine):

| Metric | Value |
|---|---|
| MAE | 0.7563 |
| RMSE | 0.9759 |
| Evaluated ratings | 2,000 |
| Split | 80/20, seed 42, no leakage |

---

## The dataset (unchanged, real data)

| File | Rows | Notes |
|---|---|---|
| `data/movies.csv` | 9,742 movies | 19 genres + “(no genres listed)” |
| `data/ratings.csv` | 100,836 ratings | 610 users, range 0.5–5.0, mean 3.502 |
| `data/tags.csv` | 3,683 tags | only 1,572 movies have tags |
| `data/links.csv` | 9,742 movies | `imdbId`, `tmdbId` (no poster URLs) |

This is the MovieLens **ml-latest-small** dataset. Nothing in `data/` is modified, ever —
the backend opens it read-only.

---

## The original notebook

Still here and still working — it is the ML report for the project:

1. Open `Personalized_Movie_Recommendation.ipynb` in VS Code (Jupyter extension).
2. Select the notebook environment's Python kernel.
3. Run cells top to bottom.

```powershell
# notebook dependencies (from the project root)
python -m pip install -r requirements.txt
```

The backend reuses the same logic, re-implemented as importable modules — **the `.ipynb` file was never edited.**

---

## Testing performed

- All 10 API endpoints tested against the real dataset (including 404 error paths).
- Content-based output verified identical to the notebook's saved CSV (A Bug's Life 0.8622).
- Collaborative predictions verified on real users (neighbours, predicted ratings, history).
- Frontend production build succeeds (`npm run build`).
- Every page rendered headlessly with real API data: Discover, Movie detail, For You,
  Watchlist, ML Insights, How It Works — plus empty state, search-with-no-results and
  invalid-movie-id error state.
- Backend logs checked: no tracebacks, no 500s.

---

## Deployment

### Backend → Render

1. Push this project to GitHub (the folder containing `backend/`, `frontend/`, `data/`).
2. On [render.com](https://render.com) → **New → Web Service** → connect the repo.
3. Settings:
   - **Root Directory:** `backend`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Deploy. Your API will be at `https://<your-name>.onrender.com` — check
   `https://<your-name>.onrender.com/api/health`.

> The `data/` folder stays at the repo root, and `backend/app/config.py` finds it relative to
> its own location, so no path changes are needed. First boot takes ~30–60 s while the models
> are built (Render's free tier may sleep after inactivity — the first request wakes it up).

### Frontend → Vercel

1. On [vercel.com](https://vercel.com) → **New Project** → import the same repo.
2. Settings:
   - **Framework Preset:** Vite
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build` (auto-detected)
3. **Before deploying**, edit `frontend/vercel.json` and replace `YOUR-PROJECT-NAME` with your
   real Render service name:

   ```json
   { "rewrites": [ { "source": "/api/:path*", "destination": "https://<your-name>.onrender.com/api/:path*" } ] }
   ```

   This forwards every `/api/...` call from Vercel to your Render backend.
4. Deploy, then visit your Vercel URL — the green dot in the navbar confirms the connection.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Red dot in navbar / “Could not reach the CineMatch server” | The backend isn't running — start it: `cd backend` then `.\.venv\Scripts\python.exe run.py` |
| `Could not find the MovieLens CSV files` | Start the backend from inside the project folder (the one containing `data/`), or check that `data/movies.csv` exists |
| `Port 8000 is already in use` | A previous server is still running — close its terminal or run `Get-NetTCPConnection -LocalPort 8000 \| Select OwningProcess` then `Stop-Process -Id <id>` |
| `npm : File ... npm.ps1 ... disabled` | Run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` in that terminal, or use `npm.cmd` |
| Blank page | Check the browser console (F12); usually the backend is not running yet |
| Insights page says metrics “not computed” | Evaluation runs a few seconds after startup — wait and press “Check again” |

---

## Limitations & future work

- The dataset has **no posters or plots**, so posters are generated locally from genre colours.
- Recommendations follow **dataset users' rating history**; there is no sign-up system, and the
  app never fabricates ratings or metrics. Watchlist/favourites live in `localStorage` only.
- User-based CF is an explainable academic baseline — natural extensions are item-based CF,
  matrix factorisation (SVD), and a hybrid ranker.
- A brand-new visitor (no ratings) faces the cold-start problem; a production system would ask
  for a few favourite genres first.

> This is a student project baseline for demonstration, not a production recommender.
