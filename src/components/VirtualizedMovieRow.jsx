import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import MovieCard from './MovieCard'

const OVERSCAN = 2

function VirtualizedMovieRow({ movies, onSelectMovie, hoverAutoplayEnabled }) {
  const containerRef = useRef(null)
  const [range, setRange] = useState({ start: 0, end: 12 })

  const updateRange = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const itemWidth = container.clientWidth >= 768 ? 192 : container.clientWidth >= 640 ? 176 : 160
    const visible = Math.ceil(container.clientWidth / (itemWidth + 20))
    const start = Math.max(0, Math.floor(container.scrollLeft / (itemWidth + 20)) - OVERSCAN)
    setRange({ start, end: Math.min(movies.length, start + visible + OVERSCAN * 2) })
  }, [movies.length])

  useEffect(() => {
    updateRange()
    const container = containerRef.current
    if (!container) return
    container.addEventListener('scroll', updateRange, { passive: true })
    const observer = new ResizeObserver(updateRange)
    observer.observe(container)
    return () => {
      container.removeEventListener('scroll', updateRange)
      observer.disconnect()
    }
  }, [updateRange])

  const visibleMovies = useMemo(() => movies.slice(range.start, range.end), [movies, range])
  const cardWidth = containerRef.current && containerRef.current.clientWidth >= 768
    ? 192
    : containerRef.current && containerRef.current.clientWidth >= 640
      ? 176
      : 160
  const itemWidth = 'w-40 sm:w-44 md:w-48'

  return (
    <div ref={containerRef} className="flex gap-5 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {range.start > 0 && <div className="shrink-0" style={{ width: range.start * (cardWidth + 20) }} />}
      {visibleMovies.map((movie) => (
        <div key={movie.imdbId || movie.title} className={`snap-start shrink-0 ${itemWidth}`}>
          <MovieCard {...movie} onClick={() => onSelectMovie(movie)} hoverAutoplayEnabled={hoverAutoplayEnabled} />
        </div>
      ))}
      {range.end < movies.length && <div className="shrink-0" style={{ width: (movies.length - range.end) * (cardWidth + 20) }} />}
    </div>
  )
}

export default VirtualizedMovieRow
