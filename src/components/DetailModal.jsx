/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus, Check, Loader2, TriangleAlert, Search, Film, ChevronDown, Info } from 'lucide-react'
import { isLoggedIn, addToWatchlist, removeFromWatchlist, isInWatchlist } from '../services/stremioApi'
import { searchStreams, evaluateStreamHealth, validateStreamForPlayback } from '../utils/streamAddons'
import { useMountTransition } from '../hooks/useMountTransition'
import { getCinemetaMeta } from '../hooks/useCinemeta'
import { markAsWatched, unmarkAsWatched, isWatched } from '../utils/watchProgress'
import StreamQualityPicker from './StreamQualityPicker'
import TiltButton from './TiltButton'

const TRANSITION_MS = 300

function DetailModal({ movie, onClose, onPlay, onRequireLogin, onPlayTrailer }) {
  const [inWatchlist, setInWatchlist] = useState(false)
  const [isCheckingWatchlist, setIsCheckingWatchlist] = useState(false)
  const [isTogglingWatchlist, setIsTogglingWatchlist] = useState(false)
  const [watchlistError, setWatchlistError] = useState('')

  const [showStreamPicker, setShowStreamPicker] = useState(false)
  const [isSearchingStreams, setIsSearchingStreams] = useState(false)
  const [streamResults, setStreamResults] = useState([])
  const [streamSearchError, setStreamSearchError] = useState('')

  const [showMoreDetails, setShowMoreDetails] = useState(false)
  const [pendingConfirmStream, setPendingConfirmStream] = useState(null)

  // Series handling: enriched videos + S/E selection
  const [seriesVideos, setSeriesVideos] = useState(null)
  const [isLoadingSeriesMeta, setIsLoadingSeriesMeta] = useState(false)
  const [selectedSeason, setSelectedSeason] = useState(null)
  const [selectedEpisode, setSelectedEpisode] = useState(null)
  const [seriesMetaError, setSeriesMetaError] = useState('')
  const [watchedTick, setWatchedTick] = useState(0)

  const lastMovieRef = useRef(movie)
  useEffect(() => {
    if (movie) lastMovieRef.current = movie
  }, [movie])
  const displayMovie = movie || lastMovieRef.current

  const { shouldRender, phase } = useMountTransition(Boolean(movie), TRANSITION_MS)

  useEffect(() => {
    setWatchlistError('')
    setShowStreamPicker(false)
    setStreamResults([])
    setStreamSearchError('')
    setPendingConfirmStream(null)
    setShowMoreDetails(false)
    // reset series selection when movie changes (but keep fetch logic separate)
    setSelectedSeason(null)
    setSelectedEpisode(null)
    setSeriesMetaError('')

    if (!movie || !movie.imdbId || !isLoggedIn()) {
      setInWatchlist(false)
      return
    }

    let cancelled = false
    setIsCheckingWatchlist(true)

    isInWatchlist(movie.imdbId).then((result) => {
      if (!cancelled) {
        setInWatchlist(result)
        setIsCheckingWatchlist(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [movie])

  // Fetch full Cinemeta meta for series to get videos (episodes) when catalog item has none
  useEffect(() => {
    if (!displayMovie || displayMovie.type !== 'series') {
      setSeriesVideos(null)
      setIsLoadingSeriesMeta(false)
      return
    }
    // If displayMovie already carries videos (e.g., after a previous fetch or if catalog unexpectedly includes them)
    if (Array.isArray(displayMovie.videos) && displayMovie.videos.length > 0) {
      setSeriesVideos(displayMovie.videos)
      return
    }
    if (!displayMovie.imdbId) {
      setSeriesVideos([])
      return
    }
    let cancelled = false
    setIsLoadingSeriesMeta(true)
    setSeriesMetaError('')
    getCinemetaMeta(displayMovie.type, displayMovie.imdbId)
      .then((meta) => {
        if (cancelled) return
        if (meta && Array.isArray(meta.videos) && meta.videos.length > 0) {
          setSeriesVideos(meta.videos)
        } else {
          setSeriesVideos([])
          if (!meta) setSeriesMetaError('Could not load episode list.')
        }
        setIsLoadingSeriesMeta(false)
      })
      .catch((err) => {
        if (cancelled) return
        setSeriesVideos([])
        setSeriesMetaError(err?.message || 'Failed to load episodes.')
        setIsLoadingSeriesMeta(false)
      })
    return () => {
      cancelled = true
    }
  }, [displayMovie?.imdbId, displayMovie?.type, displayMovie?.videos])

  // Derived season / episode data
  const allVideos = useMemo(() => {
    if (displayMovie?.type !== 'series') return []
    return seriesVideos || displayMovie?.videos || []
  }, [seriesVideos, displayMovie])

  const seasons = useMemo(() => {
    if (!allVideos || allVideos.length === 0) return []
    const set = new Set(allVideos.map((v) => v.season))
    return Array.from(set).sort((a, b) => a - b)
  }, [allVideos])

  const episodesForSeason = useMemo(() => {
    if (selectedSeason == null) return []
    return allVideos
      .filter((v) => v.season === selectedSeason)
      .sort((a, b) => (a.episode ?? a.number ?? 0) - (b.episode ?? b.number ?? 0))
  }, [allVideos, selectedSeason])

  // Auto-select season/episode. Respects initial movie.season/episode (e.g. Next Episode or Continue Watching) if valid, otherwise first non-zero season.
  useEffect(() => {
    if (displayMovie?.type !== 'series') return
    if (!seasons || seasons.length === 0) return
    // If movie was opened with a specific season/episode (next-episode flow), honor it
    if (displayMovie.season != null && seasons.includes(displayMovie.season)) {
      if (selectedSeason !== displayMovie.season) setSelectedSeason(displayMovie.season)
      return
    }
    const preferred = seasons.find((s) => s !== 0) ?? seasons[0]
    if (selectedSeason == null || !seasons.includes(selectedSeason)) {
      setSelectedSeason(preferred)
    }
  }, [seasons, displayMovie?.type, displayMovie?.season])

  useEffect(() => {
    if (displayMovie?.type !== 'series') return
    if (selectedSeason == null) return
    const eps = allVideos.filter((v) => v.season === selectedSeason).sort((a, b) => (a.episode ?? a.number ?? 0) - (b.episode ?? b.number ?? 0))
    if (eps.length === 0) return
    // Honor initial episode if provided
    if (displayMovie.episode != null && displayMovie.season === selectedSeason) {
      const initial = eps.find((e) => e.episode === displayMovie.episode || e.id === displayMovie.episodeId)
      if (initial && selectedEpisode?.id !== initial.id) {
        setSelectedEpisode(initial)
        return
      }
    }
    const currentInSeason = selectedEpisode && selectedEpisode.season === selectedSeason && eps.find((e) => e.id === selectedEpisode.id)
    if (!currentInSeason) {
      setSelectedEpisode(eps[0])
    }
  }, [selectedSeason, allVideos, displayMovie?.type, displayMovie?.episode, displayMovie?.episodeId])

  // Changing episode invalidates previous stream results
  useEffect(() => {
    if (displayMovie?.type !== 'series') return
    // Don't clear on initial mount when selectedEpisode first set; do clear on subsequent changes after streams were shown
    if (showStreamPicker || streamResults.length > 0 || streamSearchError) {
      setShowStreamPicker(false)
      setStreamResults([])
      setStreamSearchError('')
      setPendingConfirmStream(null)
    }
  }, [selectedEpisode?.id])

  if (!shouldRender || !displayMovie) return null

  const {
    title, year, description, backdropUrl, posterUrl, videoUrl, type, imdbId,
    maturityRating, duration, seasons: seasonCount, is4K, isHDR, audioFormat,
    cast, directors, creators, genres, audioLanguages, subtitleLanguages,
    productionCompanies, trailerId,
  } = displayMovie
  const image = backdropUrl || posterUrl
  const isSeries = type === 'series'
  const isLive = ['tv','channel','live'].includes(String(type||'').toLowerCase()) || Boolean(displayMovie.isLive)
  const isEntered = phase === 'entered'
  const hasTrailer = Boolean(trailerId || onPlayTrailer)

  async function handleWatchlistClick() {
    if (!isLoggedIn()) {
      if (onRequireLogin) onRequireLogin()
      return
    }
    if (!displayMovie.imdbId) {
      setWatchlistError('This title has no ID to save yet.')
      return
    }
    setIsTogglingWatchlist(true)
    setWatchlistError('')
    try {
      if (inWatchlist) {
        await removeFromWatchlist(displayMovie)
        setInWatchlist(false)
      } else {
        await addToWatchlist(displayMovie)
        setInWatchlist(true)
      }
    } catch (err) {
      setWatchlistError(err.message || 'Failed to update watchlist.')
    }
    setIsTogglingWatchlist(false)
  }

  async function handleFindStreams() {
    // For series, require an episode selection
    if (isSeries && (!selectedEpisode || selectedEpisode.season == null || selectedEpisode.episode == null)) {
      setStreamSearchError('Select a season and episode first.')
      setShowStreamPicker(true)
      return
    }
    setShowStreamPicker(true)
    setIsSearchingStreams(true)
    setStreamSearchError('')
    setStreamResults([])
    const opts = isSeries && selectedEpisode ? { season: selectedEpisode.season, episode: selectedEpisode.episode } : {}
    const result = await searchStreams(type || 'movie', imdbId, opts)
    if (result.ok) {
      setStreamResults(result.results)
    } else {
      setStreamSearchError(result.error)
    }
    setIsSearchingStreams(false)
  }

  function buildEpisodePlaybackPayload(base) {
    if (!isSeries || !selectedEpisode) return base
    return {
      ...base,
      season: selectedEpisode.season,
      episode: selectedEpisode.episode,
      episodeId: selectedEpisode.id, // e.g. tt123:1:2
      episodeTitle: selectedEpisode.title,
      episodeThumbnail: selectedEpisode.thumbnail,
      videos: allVideos, // pass full episode list so PlayerView can compute nextEpisode without refetch
      // For display in PlayerView / Continue Watching: combine series + episode titles
      displayTitle: `${base.title} — S${String(selectedEpisode.season).padStart(2, '0')}E${String(selectedEpisode.episode).padStart(2, '0')} ${selectedEpisode.title ? `· ${selectedEpisode.title}` : ''}`.trim(),
    }
  }

  async function handleSelectStream(stream) {
    const validation = validateStreamForPlayback(stream)
    if (validation.shouldBlock) {
      setPendingConfirmStream({ stream, validation })
      return
    }
    const base = buildEpisodePlaybackPayload(displayMovie)
    // Prefer direct http URL (RealDebrid/cached) even if infoHash present — no server needed, plays instantly (Stremio behavior)
    if (stream.url) {
      onPlay({ ...base, videoUrl: stream.url, streamHealth: evaluateStreamHealth(stream), isDirect: true })
      return
    }
    onPlay({ ...base, pendingStream: stream, videoUrl: null })
  }

  function handleConfirmPlayAnyway() {
    if (!pendingConfirmStream) return
    const { stream } = pendingConfirmStream
    setPendingConfirmStream(null)
    const base = buildEpisodePlaybackPayload(displayMovie)
    if (stream.url) {
      onPlay({ ...base, videoUrl: stream.url, streamHealth: evaluateStreamHealth(stream), isDirect: true })
    } else {
      onPlay({ ...base, pendingStream: stream, videoUrl: null })
    }
  }

  // Full-page detail view: entire viewport is the movie art. No centered card.
  // Left ~45% holds all movie info + Trailer + Watchlist (+ S/E picker for series).
  // Right ~55% holds the Find Stream button and, when expanded, the addon/category + stream list.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      role="dialog"
      aria-modal="true"
    >
      {/* Full-bleed movie art background — art fully visible at top, fades below */}
      <div className="absolute inset-0">
        <img src={image} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/15 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-l from-black/10 via-transparent to-transparent pointer-events-none" />
      </div>

      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className={`absolute inset-0 z-0 cursor-default transition-opacity duration-300 ease-[var(--ease-spring-soft)] motion-reduce:transition-none ${
          isEntered ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ background: 'transparent' }}
      />

      <div
        className={`relative z-10 flex h-full w-full flex-col transition-[opacity,transform] duration-300 motion-reduce:transition-none motion-reduce:transform-none ${
          isEntered ? 'opacity-100 scale-100 ease-[var(--ease-spring)]' : 'opacity-0 scale-[0.98] ease-[var(--ease-spring-soft)]'
        }`}
      >
        <div className="flex items-center justify-end p-4 md:p-6 shrink-0">
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onClose()
            }}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onClose()
            }}
            className="w-9 h-9 rounded-full bg-black/50 hover:bg-black/60 active:bg-black/70 backdrop-blur-md border border-white/10 flex items-center justify-center text-white transition-colors duration-100 active:scale-95 will-change-transform"
            aria-label="Close details"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {/* Top spacer lets movie art breathe — hero visible before content */}
          <div className="h-[8vh] md:h-[10vh] lg:h-[12vh] shrink-0 pointer-events-none" aria-hidden />
          <div className="flex-1 min-h-0 flex flex-col lg:flex-row w-full max-w-[1600px] mx-auto px-4 md:px-8 lg:px-10 pb-8 gap-6 lg:gap-8 overflow-hidden">
            {/* LEFT: movie info + Trailer + Watchlist + (series) S/E picker — isolated scroll */}
            <div className="w-full lg:w-[42%] xl:w-[40%] shrink-0 flex flex-col gap-4 pt-2 lg:pt-4 overflow-y-auto overscroll-contain pr-1" style={{ isolation: 'isolate', WebkitOverflowScrolling: 'touch' }}>
              <div>
                <h2 className="text-3xl md:text-4xl lg:text-[2.6rem] font-bold tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] leading-tight">{title}</h2>
                <div className="flex items-center gap-2.5 flex-wrap text-sm mt-3">
                  {isLive && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-600 text-white text-[11px] font-bold tracking-widest"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />LIVE</span>}
                  {year && <span className="text-white/90 font-medium">{year}</span>}
                  {maturityRating && (
                    <span className="px-1.5 py-0.5 rounded border border-white/30 text-white/90 text-xs font-medium bg-black/20">
                      {maturityRating}
                    </span>
                  )}
                  {duration && !isLive && <span className="text-white/80">{duration}</span>}
                  {seasonCount && !isLive && <span className="text-white/80">{seasonCount} Season{seasonCount === 1 ? '' : 's'}</span>}
                  {is4K && (
                    <span className="px-1.5 py-0.5 rounded bg-white/15 text-white/90 text-xs font-semibold tracking-wide border border-white/10">4K</span>
                  )}
                  {isHDR && (
                    <span className="px-1.5 py-0.5 rounded bg-white/15 text-white/90 text-xs font-semibold tracking-wide border border-white/10">HDR</span>
                  )}
                  {audioFormat && (
                    <span className="px-1.5 py-0.5 rounded bg-white/15 text-white/90 text-xs font-semibold tracking-wide border border-white/10">{audioFormat}</span>
                  )}
                </div>
                {isSeries && selectedEpisode && (
                  <p className="text-sm text-accent font-medium mt-2">S{String(selectedEpisode.season).padStart(2, '0')} · E{String(selectedEpisode.episode).padStart(2, '0')} — {selectedEpisode.title}</p>
                )}
              </div>

              <p className="text-[15px] leading-relaxed text-white/85 drop-shadow-sm">
                {description || 'No synopsis available yet for this title.'}
              </p>

              {genres && genres.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  {genres.map((genre) => (
                    <span key={genre} className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-white/90 border border-white/10">
                      {genre}
                    </span>
                  ))}
                </div>
              )}

              {/* Series season/episode picker */}
              {isSeries && (
                <div className="rounded-2xl bg-black/35 backdrop-blur-xl border border-white/10 p-3">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-white">Episodes</h3>
                    {isLoadingSeriesMeta && <Loader2 className="w-4 h-4 animate-spin text-white/60" />}
                  </div>
                  {seriesMetaError && <p className="text-xs text-red-300 mb-2">{seriesMetaError}</p>}
                  {seasons.length > 0 ? (
                    <>
                      <div className="flex gap-1.5 flex-wrap mb-3">
                        {seasons.map((season) => (
                          <button
                            key={season}
                            onClick={() => setSelectedSeason(season)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                              selectedSeason === season
                                ? 'bg-accent text-white border-accent'
                                : 'bg-white/10 text-white/80 border-white/10 hover:bg-white/15 hover:text-white'
                            }`}
                          >
                            {season === 0 ? 'Specials' : `Season ${season}`}
                          </button>
                        ))}
                      </div>
                      <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                        {episodesForSeason.map((ep) => {
                          const isSelected = selectedEpisode?.id === ep.id
                          void watchedTick
                          const epPayload = { imdbId: displayMovie.imdbId, type: 'series', season: ep.season, episode: ep.episode, episodeId: ep.id, title: displayMovie.title }
                          const epWatched = isWatched(epPayload)
                          return (
                            <div
                              key={ep.id}
                              className={`w-full flex gap-2 p-2 rounded-xl border transition-colors ${isSelected ? 'bg-accent/20 border-accent/40 ring-1 ring-accent/30' : 'bg-white/5 border-white/10 hover:bg-white/10'} ${epWatched ? 'opacity-60' : ''}`}
                            >
                              <button
                                onClick={() => setSelectedEpisode(ep)}
                                className="flex gap-3 flex-1 min-w-0 text-left"
                              >
                                {ep.thumbnail ? (
                                  <img src={ep.thumbnail} alt={ep.title} className="w-20 h-12 rounded-lg object-cover shrink-0 bg-black/20" loading="lazy" />
                                ) : (
                                  <div className="w-20 h-12 rounded-lg bg-white/10 shrink-0 flex items-center justify-center text-[10px] text-white/50">E{ep.episode}</div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className={`text-xs font-medium truncate ${isSelected ? 'text-white' : 'text-white/90'}`}>E{String(ep.episode).padStart(2, '0')} — {ep.title} {epWatched ? '· Watched' : ''}</p>
                                  {ep.overview && <p className="text-[11px] text-white/60 line-clamp-2 leading-snug mt-0.5">{ep.overview}</p>}
                                  {ep.released && <p className="text-[10px] text-white/40 mt-1">{new Date(ep.released).toLocaleDateString()}</p>}
                                </div>
                                {isSelected && <Check className="w-4 h-4 text-accent shrink-0 mt-1" />}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (epWatched) unmarkAsWatched(epPayload)
                                  else markAsWatched(epPayload)
                                  setWatchedTick((t) => t + 1)
                                }}
                                title={epWatched ? 'Watched — click to unmark' : 'Mark as watched'}
                                className={`shrink-0 self-center w-7 h-7 rounded-full flex items-center justify-center border transition-colors ${epWatched ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-white/10 border-white/10 text-white/60 hover:bg-white/15 hover:text-white'}`}
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  ) : (
                    !isLoadingSeriesMeta && <p className="text-xs text-white/60">No episodes found for this series.</p>
                  )}
                </div>
              )}

              {/* All movie info — compact meta sits right above the action pills on the right side of this column */}
              <div className="space-y-3 text-sm pt-3 border-t border-white/10">
                {cast && cast.length > 0 && (
                  <div>
                    <p className="text-white/50 mb-1 text-xs uppercase tracking-wide">Cast</p>
                    <p className="text-white/85 leading-snug text-sm">{cast.slice(0, 4).join(', ')}</p>
                  </div>
                )}
                {(directors && directors.length > 0) || (creators && creators.length > 0) ? (
                  <div>
                    <p className="text-white/50 mb-1 text-xs uppercase tracking-wide">{type === 'series' ? 'Creators' : 'Director'}</p>
                    <p className="text-white/85 leading-snug text-sm">{(creators || directors).join(', ')}</p>
                  </div>
                ) : null}
                {audioLanguages && audioLanguages.length > 0 && (
                  <div>
                    <p className="text-white/50 mb-1 text-xs uppercase tracking-wide">Audio</p>
                    <p className="text-white/85 leading-snug text-sm">{audioLanguages.join(', ')}</p>
                  </div>
                )}
                {subtitleLanguages && subtitleLanguages.length > 0 && (
                  <div>
                    <p className="text-white/50 mb-1 text-xs uppercase tracking-wide">Subtitles</p>
                    <p className="text-white/85 leading-snug text-sm">{subtitleLanguages.join(', ')}</p>
                  </div>
                )}
                {(cast?.length > 4 || productionCompanies?.length > 0) && (
                  <button
                    type="button"
                    onClick={() => setShowMoreDetails((prev) => !prev)}
                    className="flex items-center gap-1.5 text-xs font-medium text-white/70 hover:text-white mt-1 transition-colors duration-200"
                  >
                    <Info className="w-3.5 h-3.5" />
                    More Details
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ease-[var(--ease-spring-soft)] ${showMoreDetails ? 'rotate-180' : ''}`} />
                  </button>
                )}
                <div
                  className={`grid transition-[grid-template-rows] duration-300 ease-[var(--ease-spring-soft)] motion-reduce:transition-none ${
                    showMoreDetails ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="pt-2 space-y-2">
                      {cast && cast.length > 0 && (
                        <div>
                          <p className="text-white/50 mb-1 text-xs uppercase tracking-wide">Full Cast</p>
                          <p className="text-white/75 leading-relaxed text-xs">{cast.join(', ')}</p>
                        </div>
                      )}
                      {productionCompanies && productionCompanies.length > 0 && (
                        <div>
                          <p className="text-white/50 mb-1 text-xs uppercase tracking-wide">Production</p>
                          <p className="text-white/75 leading-relaxed text-xs">{productionCompanies.join(', ')}</p>
                        </div>
                      )}
                      {imdbId && (
                        <div>
                          <p className="text-white/50 mb-1 text-xs uppercase tracking-wide">Technical</p>
                          <p className="text-white/75 leading-relaxed text-xs">
                            IMDb ID: {imdbId}
                            {videoUrl && ' · Source resolved'}
                            {isSeries && selectedEpisode && ` · ${selectedEpisode.id}`}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap pt-1">
                {hasTrailer && (
                  <TiltButton
                    onClick={() => onPlayTrailer?.(buildEpisodePlaybackPayload(displayMovie))}
                    className="shrink-0 flex items-center gap-2 px-6 py-3 rounded-full bg-white/10 text-white text-base font-semibold border border-white/15 hover:bg-white/15 backdrop-blur-md transition-colors duration-200"
                  >
                    <Film className="w-5 h-5" />
                    Trailer
                  </TiltButton>
                )}
                <TiltButton
                  onClick={handleWatchlistClick}
                  disabled={isTogglingWatchlist || isCheckingWatchlist}
                  className={
                    "shrink-0 flex items-center gap-2 px-6 py-3 rounded-full text-base font-semibold border backdrop-blur-md transition-colors duration-200 disabled:opacity-60 " +
                    (inWatchlist
                      ? "bg-accent text-white border-accent hover:bg-accent/90"
                      : "bg-white/10 text-white border-white/15 hover:bg-white/15")
                  }
                >
                  {isTogglingWatchlist || isCheckingWatchlist ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : inWatchlist ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <Plus className="w-5 h-5" />
                  )}
                  {inWatchlist ? 'In Watchlist' : 'Watchlist'}
                </TiltButton>
              </div>

              {watchlistError && (
                <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{watchlistError}</p>
              )}
            </div>

            {/* RIGHT: Streams — own section, does not scroll outer, only inner windows scroll */}
            <div className="w-full lg:w-[58%] xl:w-[60%] min-w-0 flex flex-col gap-4 overflow-hidden min-h-0">
              <div
                className="rounded-3xl overflow-hidden flex flex-col flex-1 min-h-0 border border-white/12"
                style={{
                  isolation: 'isolate',
                  background: 'rgba(18,18,22,0.32)',
                  backdropFilter: 'blur(16px) saturate(150%)',
                  WebkitBackdropFilter: 'blur(16px) saturate(150%)',
                  boxShadow: '0 10px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)',
                  willChange: 'transform',
                  transform: 'translateZ(0)',
                  contain: 'layout paint',
                }}
              >
                <div className="p-4 md:p-5 flex items-center justify-between gap-3 border-b border-white/10 shrink-0">
                  <div>
                    <h3 className="text-base font-semibold text-white">Streams</h3>
                    <p className="text-xs text-white/60 mt-0.5">
                      {isSeries && selectedEpisode
                        ? showStreamPicker
                          ? streamResults.length > 0
                            ? `${streamResults.length} sources`
                            : isSearchingStreams
                              ? `Searching S${String(selectedEpisode.season).padStart(2, '0')}E${String(selectedEpisode.episode).padStart(2, '0')}…`
                              : `Find sources for S${String(selectedEpisode.season).padStart(2, '0')}E${String(selectedEpisode.episode).padStart(2, '0')}`
                          : `S${String(selectedEpisode.season).padStart(2, '0')}E${String(selectedEpisode.episode).padStart(2, '0')} — ${selectedEpisode.title}`
                        : showStreamPicker
                          ? streamResults.length > 0
                            ? `${streamResults.length} sources`
                            : isSearchingStreams
                              ? 'Searching providers…'
                              : 'Find sources to play this title'
                          : 'Discover streaming sources from your addons'}
                    </p>
                  </div>
                  {!showStreamPicker ? (
                    <button
                      onClick={handleFindStreams}
                      disabled={isSeries && !selectedEpisode}
                      className="shrink-0 flex items-center gap-2 px-6 py-3 rounded-full bg-accent text-white text-base font-semibold hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Search className="w-5 h-5" />
                      Find Streams
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        // Cancel aborts any in-flight search and collapses the picker — mirrors Hide but with clearer intent and also clears pending confirm
                        setIsSearchingStreams(false)
                        setShowStreamPicker(false)
                        setStreamResults([])
                        setStreamSearchError('')
                        setPendingConfirmStream(null)
                      }}
                      className="shrink-0 px-4 py-2 rounded-full bg-white/10 text-white text-xs font-medium hover:bg-white/15 transition-colors border border-white/10"
                    >
                      Cancel
                    </button>
                  )}
                </div>

                <div className="flex-1 min-h-0 p-3 md:p-4 flex flex-col overflow-hidden">
                  {!showStreamPicker ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 py-10 px-6">
                      <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center">
                        <Search className="w-6 h-6 text-white/70" />
                      </div>
                        <p className="text-sm text-white/80 max-w-sm">
                        {isSeries ? (
                          selectedEpisode ? (
                            <>Click <span className="text-white font-medium">Find Streams</span> to search addons for <span className="text-white">S{String(selectedEpisode.season).padStart(2, '0')}E{String(selectedEpisode.episode).padStart(2, '0')} — {selectedEpisode.title}</span>.</>
                          ) : (
                            <>Select a season and episode on the left, then find streams.</>
                          )
                        ) : (
                          <>Click <span className="text-white font-medium">Find Streams</span> to search your installed addons for available sources.</>
                        )}
                      </p>

                    </div>
                  ) : (
                    <>
                      {isSearchingStreams && (
                        <div className="flex items-center gap-2 text-sm text-white/70 py-6 justify-center">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Searching torrent providers...
                        </div>
                      )}
                      {streamSearchError && (
                        <p className="text-sm text-white/60 py-4 text-center">{streamSearchError}</p>
                      )}
                      {streamResults.length > 0 && (
                        <div className="flex-1 min-h-0 flex flex-col">
                          <StreamQualityPicker
                            streams={streamResults}
                            onSelectStream={handleSelectStream}
                            resolvingStreamId={null}
                            disableHover
                          />
                        </div>
                      )}
                      {!isSearchingStreams && !streamSearchError && streamResults.length === 0 && (
                        <p className="text-sm text-white/60 py-6 text-center">No streams found for this title.</p>
                      )}
                      {pendingConfirmStream && (
                        <div className="mt-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                          <div className="flex items-start gap-2">
                            <TriangleAlert className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-amber-200">
                                This stream appears {pendingConfirmStream.validation.health.status === 'dead' ? 'dead — very likely to fail' : 'weak'}
                              </p>
                              <p className="text-xs text-amber-300 mt-1">{pendingConfirmStream.validation.blockReason}</p>
                              {pendingConfirmStream.validation.warnings?.length > 0 && (
                                <ul className="text-xs text-amber-400 mt-2 list-disc list-inside space-y-0.5">
                                  {pendingConfirmStream.validation.warnings.slice(0, 2).map((w, i) => (
                                    <li key={i}>{w}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2 mt-4">
                            <button type="button" onClick={() => setPendingConfirmStream(null)} className="flex-1 px-4 py-2 rounded-full bg-white/10 text-white text-sm font-medium border border-white/10">Cancel</button>
                            <button type="button" onClick={handleConfirmPlayAnyway} className="flex-1 px-4 py-2 rounded-full bg-accent text-white text-sm font-medium">Play anyway</button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default DetailModal
