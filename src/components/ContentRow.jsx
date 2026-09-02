import SectionHeading from './SectionHeading'
import VirtualizedMovieRow from './VirtualizedMovieRow'

function ContentRow({ title, movies, onSelectMovie, hoverAutoplayEnabled, onSeeAll }) {
  // Show See all arrow when there are enough items to justify a full view (like Stremio).
  // We keep homepage/catalogs virtualized; the expanded view itself will be fully loaded.
  const showSeeAll = typeof onSeeAll === 'function' && Array.isArray(movies) && movies.length > 0
  return (
    <div className="mb-10">
      <SectionHeading onSeeAll={showSeeAll ? onSeeAll : undefined}>{title}</SectionHeading>

      <VirtualizedMovieRow movies={movies} onSelectMovie={onSelectMovie} hoverAutoplayEnabled={hoverAutoplayEnabled} />
    </div>
  )
}

export default ContentRow
