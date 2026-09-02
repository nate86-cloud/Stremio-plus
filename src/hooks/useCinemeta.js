import { useState, useEffect } from 'react'
import { fetchCatalog, fetchMeta, searchCatalog, CINEMETA_ADDON_URL, normalizeImdbId } from '../services/stremioApi'

// Converts a raw Cinemeta catalog item into the flat shape our components
// already expect (title, year, posterUrl, trailerId, imdbId, backdropUrl).
// Keeping this normalization in one place means MovieCard, HeroBanner, and
// ContentRow never need to know anything about Cinemeta's actual response
// format — if that format changes, we only fix it here.
function normalizeCinemetaItem(item) {
  if (!item) return null

  // Cinemeta trailers look like: [{ source: 'youtubeId', type: 'Trailer' }]
  const trailerEntry = Array.isArray(item.trailers)
    ? item.trailers.find((t) => t.type === 'Trailer') || item.trailers[0]
    : null

  // For series, Cinemeta returns `videos`: [{ id: 'tt123:1:2', season, episode, number, name, overview, thumbnail, released, ... }]
  // Catalog responses omit this; meta responses include it. Preserve if present so DetailModal can render S/E picker.
  let videos = null
  if (Array.isArray(item.videos) && item.videos.length > 0) {
    videos = item.videos.map((v) => ({
      id: v.id, // already "tt...:season:episode"
      season: v.season ?? v.season_number ?? 0,
      episode: v.episode ?? v.number ?? 0,
      number: v.number ?? v.episode ?? 0,
      title: v.name || v.title || `Episode ${v.episode ?? v.number ?? ''}`,
      name: v.name || v.title || '',
      overview: v.overview || v.description || '',
      description: v.description || v.overview || '',
      thumbnail: v.thumbnail || null,
      released: v.released || v.firstAired || null,
      firstAired: v.firstAired || v.released || null,
    })).filter((v) => v.season != null && v.episode != null)
  }

  return {
    imdbId: normalizeImdbId(item.id),
    title: item.name,
    year: item.year || (item.releaseInfo ? String(item.releaseInfo).slice(0, 4) : ''),
    posterUrl: item.poster,
    backdropUrl: item.background || item.poster,
    trailerId: trailerEntry?.source || null,
    description: item.description || '',
    genres: item.genres || item.genre || [],
    type: item.type,
    videos,
    // Keep raw credits for DetailModal left pane
    cast: item.cast || [],
    director: item.director || null,
    // Real playable streams don't come from Cinemeta (it's metadata-only),
    // so this stays unset until a stream addon is integrated. Downstream
    // components use this to show a "no source" state rather than
    // pretending playback is available.
    videoUrl: null,
  }
}

// Fetches a Cinemeta catalog (e.g. type 'movie', catalogId 'top') and
// returns normalized items. Used directly (not as a hook) by useCinemetaCatalog
// below, and exported in case a one-off fetch is needed elsewhere.
export async function getCinemetaCatalog(type, catalogId) {
  const rawItems = await fetchCatalog(type, catalogId, CINEMETA_ADDON_URL)
  return rawItems.map(normalizeCinemetaItem).filter(Boolean)
}

// Fetches full metadata (including trailers, which catalog responses don't
// always include) for a single item by IMDb id.
export async function getCinemetaMeta(type, imdbId) {
  const rawMeta = await fetchMeta(type, imdbId, CINEMETA_ADDON_URL)
  return normalizeCinemetaItem(rawMeta)
}

// Searches Cinemeta directly for a given type ('movie' or 'series') and
// returns normalized items — this queries Cinemeta's actual title index,
// not just whatever catalogs happen to already be loaded on Home.
export async function searchCinemeta(type, query) {
  if (!query || !query.trim()) return []
  const rawItems = await searchCatalog(type, query.trim(), CINEMETA_ADDON_URL)
  return rawItems.map(normalizeCinemetaItem).filter(Boolean)
}

// React hook: debounced full-catalog search across movies and series.
// Waits `debounceMs` after the query stops changing before firing the
// request, so fast typing doesn't spam Cinemeta with a request per
// keystroke. Returns { items, isLoading, error }.
export function useCinemetaSearch(query, debounceMs = 350) {
  const [items, setItems] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const trimmed = query.trim()

    if (!trimmed) {
      setItems([])
      setIsLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(null)

    const timeoutId = setTimeout(() => {
      Promise.all([searchCinemeta('movie', trimmed), searchCinemeta('series', trimmed)])
        .then(([movies, series]) => {
          if (cancelled) return
          setItems([...movies, ...series])
          setIsLoading(false)
        })
        .catch((err) => {
          if (cancelled) return
          setError(err.message || 'Search failed')
          setIsLoading(false)
        })
    }, debounceMs)

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [query, debounceMs])

  return { items, isLoading, error }
}

// React hook: fetches a Cinemeta catalog on mount and whenever type/catalogId
// change. Returns { items, isLoading, error } so the UI can show loading and
// error states honestly rather than silently showing nothing.
export function useCinemetaCatalog(type, catalogId) {
  const [items, setItems] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    setIsLoading(true)
    setError(null)

    getCinemetaCatalog(type, catalogId)
      .then((results) => {
        if (!cancelled) {
          setItems(results)
          setIsLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Failed to load catalog')
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [type, catalogId])

  return { items, isLoading, error }
}
