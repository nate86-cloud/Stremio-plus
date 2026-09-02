import MovieCard from './MovieCard'

function VirtualizedMovieGrid({ movies, onSelectMovie }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5 content-start">
      {movies.map((movie) => (
        <MovieCard key={movie.imdbId || movie.title} {...movie} onClick={() => onSelectMovie(movie)} />
      ))}
    </div>
  )
}

export default VirtualizedMovieGrid
