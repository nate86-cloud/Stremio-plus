import { ArrowLeft } from 'lucide-react'
import MovieCard from './MovieCard'

function CatalogExpandedView({ title, movies, onBack, onSelectMovie }) {
  return (
    <div className="animate-fadeIn">
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={onBack}
          className="glass-clear glass-interactive flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 transition-colors duration-200"
          aria-label="Back to catalogs"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="h-6 w-px bg-black/10 dark:bg-white/10" />
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{movies.length} titles</p>
        </div>
      </div>

      {/* Fully loaded grid — no virtualization, all cards render immediately for smooth scrolling */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
        {movies.map((movie) => (
          <MovieCard
            key={movie.imdbId || movie.id || movie.title}
            {...movie}
            onClick={() => onSelectMovie(movie)}
          />
        ))}
      </div>
    </div>
  )
}

export default CatalogExpandedView
