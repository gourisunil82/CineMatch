import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Navbar from './components/Navbar'
import { WatchlistProvider } from './context/WatchlistContext'
import Home from './pages/Home'
import MovieDetail from './pages/MovieDetail'
import Recommendations from './pages/Recommendations'
import Watchlist from './pages/Watchlist'
import Insights from './pages/Insights'
import HowItWorks from './pages/HowItWorks'
import { EmptyState } from './components/States'
import { IconFilm } from './components/Icons'

function NotFound() {
  return (
    <div className="container page fade-in">
      <EmptyState
        icon={<IconFilm size={22} />}
        title="Page not found"
        message="The page you are looking for does not exist."
        action={<Link className="btn btn-primary" to="/">Back to Discover</Link>}
      />
    </div>
  )
}

export default function App() {
  return (
    <WatchlistProvider>
      <BrowserRouter>
        <Navbar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/movie/:id" element={<MovieDetail />} />
          <Route path="/recommendations" element={<Recommendations />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <footer className="footer">
          <div className="container">
            <span>CineMatch · KTU S5 Machine Learning project · built on the real MovieLens dataset</span>
            <span>
              Content-based + collaborative filtering · <Link to="/how-it-works">how it works</Link>
            </span>
          </div>
        </footer>
      </BrowserRouter>
    </WatchlistProvider>
  )
}
