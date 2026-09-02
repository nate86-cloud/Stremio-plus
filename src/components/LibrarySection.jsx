import { useState, useEffect } from 'react'
import { Library } from 'lucide-react'
import SectionHeading from './SectionHeading'
import VirtualizedMovieRow from './VirtualizedMovieRow'
import VirtualizedMovieGrid from './VirtualizedMovieGrid'
import { MovieGridSkeleton } from './MediaSkeletons'
import { getLibrary } from '../services/stremioApi'
import { readLocal } from '../services/cloudSync'


function libraryItemToMovie(item) {
  return {
    title: item.name || 'Untitled',
    year: item.year || '',
    posterUrl: item.poster || 'https://placehold.co/400x600/1a1a2e/ffffff?text=No+Poster',
    description: item.description || '',
    imdbId: item._id,
    videoUrl: null,
    progress: item.state && item.state.timeOffset ? item.state.timeOffset : 0,
    duration: item.state && item.state.duration ? item.state.duration : 0,
  }
}


function LibrarySection({ isLoggedIn, onSelectMovie }) {
  const [items, setItems] = useState([])
  const [queue, setQueue] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hasLoaded, setHasLoaded] = useState(false)


  useEffect(() => {
    if (!isLoggedIn) {
      setItems([])
      setQueue([])
      setHasLoaded(false)
      return
    }


    setIsLoading(true)
    setError(null)


    // Queue lives entirely in the local store (synced to Supabase via
    // cloudSync's push/pull on login/sync, same as every other store) —
    // no separate network call needed to read it here. Falls back to []
    // defensively: readLocal returns null for an unregistered store name,
    // and queue.filter(...) below would crash the whole app on a null.
    setQueue(readLocal('playbackQueue') || [])


    getLibrary()
      .then((rawItems) => {
        setItems(rawItems.map(libraryItemToMovie))
        setIsLoading(false)
        setHasLoaded(true)
      })
      .catch((err) => {
        setError(err.message || 'Failed to load library')
        setIsLoading(false)
        setHasLoaded(true)
      })
  }, [isLoggedIn])


  if (!isLoggedIn) {
    return (
      <div className="glass-panel rounded-3xl p-12 flex flex-col items-center justify-center text-center gap-3">
        <Library className="w-10 h-10 text-neutral-400 dark:text-neutral-500" />
        <h3 className="text-lg font-medium">Sign in to see your Library</h3>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-sm">
          Your saved titles and Continue Watching progress will sync here once you are signed in with your Stremio account.
        </p>
      </div>
    )
  }


  if (isLoading) {
    return <MovieGridSkeleton count={6} />
  }


  if (error) {
    return (
      <div className="glass-panel rounded-3xl p-8 text-center">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    )
  }


  if (hasLoaded && items.length === 0) {
    return (
      <div className="glass-panel rounded-3xl p-12 flex flex-col items-center justify-center text-center gap-3">
        <Library className="w-10 h-10 text-neutral-400 dark:text-neutral-500" />
        <h3 className="text-lg font-medium">Your library is empty</h3>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-sm">
          Titles you save from Stremio (desktop, mobile, or web) will appear here once synced.
        </p>
      </div>
    )
  }


  const continueWatching = items.filter((item) => item.progress > 0 && item.duration > 0 && item.progress < item.duration * 0.95)


  // Queue order is just the array order (index 0 = play next), unlike
  // the earlier position-column design — this is simpler because the
  // queue is a single local/synced array, not per-row Supabase records.
  const continueWatchingIds = new Set(continueWatching.map((item) => item.imdbId))
  const upNext = queue.filter((item) => !continueWatchingIds.has(item.imdbId))
  const upNextIds = new Set(upNext.map((item) => item.imdbId))


  const restOfLibrary = items.filter(
    (item) => !continueWatchingIds.has(item.imdbId) && !upNextIds.has(item.imdbId)
  )


  return (
    <div>
      {continueWatching.length > 0 && (
        <div className="mb-10">
          <SectionHeading>Continue Watching</SectionHeading>
          <VirtualizedMovieRow movies={continueWatching} onSelectMovie={onSelectMovie} />
        </div>
      )}


      {upNext.length > 0 && (
        <div className="mb-10">
          <SectionHeading>Up Next</SectionHeading>
          <VirtualizedMovieRow movies={upNext} onSelectMovie={onSelectMovie} />
        </div>
      )}


      <div>
        <SectionHeading>My Library</SectionHeading>
        <VirtualizedMovieGrid movies={restOfLibrary} onSelectMovie={onSelectMovie} />
      </div>
    </div>
  )
}


export default LibrarySection