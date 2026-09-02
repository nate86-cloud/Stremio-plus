// Resolves a playable YouTube trailer id for a title, using the same
// fallback-chain idea popularized by the Streailer Stremio addon
// (TMDB → YouTube search → TMDB English fallback). This app has no TMDB
// API key configured anywhere, so instead of the TMDB legs we use:
//
//   1) Cinemeta's own trailer id — useCinemeta.js already extracts this
//      as `movie.trailerId` for free, no extra network call.
//   2) A live YouTube search, fetched through the same
//      `electronAPI.fetchAddon` bridge the addon layer already uses to
//      dodge renderer CORS restrictions (see electron.js / preload.cjs).
//      We just read the first video id out of YouTube's public results
//      page — no API key, no extra settings screen required.
//
// Two small caches keep this cheap to call from hover events, which can
// fire many times per second while a user's mouse crosses a content row:
//   - `trailerCache`: remembers the resolved result (or "no trailer
//     found") per title, forever (for the life of the app session).
//   - `inFlight`: if the same title is requested again while a search is
//     still in progress (e.g. the user re-hovers a card quickly), the
//     second caller just waits on the same promise instead of firing a
//     second network request.

const trailerCache = new Map() // cacheKey -> { youtubeId, source } | null
const inFlight = new Map() // cacheKey -> Promise

function cacheKeyFor(movie) {
  return movie.imdbId || movie.title
}

/**
 * Builds a youtube-nocookie.com embed URL with the given playback options.
 * Using the nocookie domain avoids dropping YouTube tracking cookies just
 * for a hover preview.
 */
export function getTrailerEmbedUrl(
  youtubeId,
  { autoplay = false, muted = false, loop = false, controls = true } = {}
) {
  const params = new URLSearchParams({
    autoplay: autoplay ? '1' : '0',
    mute: muted ? '1' : '0',
    controls: controls ? '1' : '0',
    modestbranding: '1',
    iv_load_policy: '3',
    rel: '0',
    playsinline: '1',
    fs: '0',
    disablekb: '1',
    autohide: '1',
    cc_load_policy: '0',
    showinfo: '0',
    enablejsapi: '1',
    origin: typeof window !== 'undefined' ? window.location.origin : '',
  })

  if (loop) {
    params.set('loop', '1')
    // YouTube only honors `loop` on a single video if `playlist` is also
    // set to that same video's id — an official quirk, not a typo.
    params.set('playlist', youtubeId)
  }

  return `https://www.youtube-nocookie.com/embed/${youtubeId}?${params.toString()}`
}

/**
 * Searches YouTube's public results page for "{title} {year} official
 * trailer" and returns the first video id found, or null.
 *
 * Requires the Electron bridge (main-process fetch) to avoid CORS —
 * returns null immediately outside Electron (e.g. a plain browser tab)
 * rather than throwing, so callers can treat "no trailer available" and
 * "can't search right now" the same way.
 */
async function searchYouTubeTrailer(title, year) {
  if (!window.electronAPI?.fetchAddon) return null
  if (!title) return null

  const query = `${title} ${year || ''} official trailer`.trim()
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`

  const response = await window.electronAPI.fetchAddon(url)
  if (!response.ok || !response.text) return null

  // YouTube embeds each result's data as JSON inside inline <script>
  // tags on the results page. Video ids appear as "videoId":"XXXXXXXXXXX"
  // — the first match is consistently the top organic result.
  const match = response.text.match(/"videoId":"([a-zA-Z0-9_-]{11})"/)
  return match ? match[1] : null
}

/**
 * Resolves a trailer for a normalized movie object (as produced by
 * useCinemeta.js — needs at least `title`, and ideally `imdbId`, `year`,
 * and `trailerId`).
 *
 * Returns { youtubeId, source } on success, or null if no trailer could
 * be found anywhere in the chain. Never throws — callers can treat a
 * rejected search the same as "not found".
 */
export async function resolveTrailer(movie) {
  if (!movie) return null
  const key = cacheKeyFor(movie)
  if (!key) return null

  if (trailerCache.has(key)) {
    return trailerCache.get(key)
  }
  if (inFlight.has(key)) {
    return inFlight.get(key)
  }

  const promise = (async () => {
    // Step 1: Cinemeta already gave us a trailer id for free.
    if (movie.trailerId) {
      const result = { youtubeId: movie.trailerId, source: 'cinemeta' }
      trailerCache.set(key, result)
      return result
    }

    // Step 2: fall back to a live YouTube search.
    try {
      const youtubeId = await searchYouTubeTrailer(movie.title, movie.year)
      const result = youtubeId ? { youtubeId, source: 'youtube-search' } : null
      trailerCache.set(key, result)
      return result
    } catch {
      trailerCache.set(key, null)
      return null
    }
  })()

  inFlight.set(key, promise)
  try {
    return await promise
  } finally {
    inFlight.delete(key)
  }
}
