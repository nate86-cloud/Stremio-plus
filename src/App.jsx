import { useState, useEffect, useRef, useMemo } from 'react'
import { Home, Compass, Bookmark, Settings, Sun, Moon, X, SearchX, Dices, Info } from 'lucide-react'
import BackToTop from './components/BackToTop'
import ControlBar from './components/ControlBar'
import HeroBanner from './components/HeroBanner'
import ContentRow from './components/ContentRow'
import VirtualizedMovieGrid from './components/VirtualizedMovieGrid'
import { MovieGridSkeleton, MovieRowSkeleton } from './components/MediaSkeletons'
import SectionHeading from './components/SectionHeading'
import DetailModal from './components/DetailModal'
import PlayerView from './components/PlayerView'
import LoginModal from './components/LoginModal'
import LibrarySection from './components/LibrarySection'
import AddonsPage from './components/AddonsPage'
import SettingsPage from './components/SettingsPage'
import ProfileInsightsModal from './components/ProfileInsightsModal'
import { isLoggedIn, getUser, logout, getLibrary, getAddonCollection, syncStremioProfile, saveProfileSettings } from './services/stremioApi'
import { getContinueWatchingList } from './utils/watchProgress'
import { useCinemetaCatalog, useCinemetaSearch } from './hooks/useCinemeta'
import { fetchAllCatalogRows } from './utils/catalogAddons'
import { useTheme } from './context/ThemeProvider'
import { useProfileContext } from './context/ProfileContext'
import { pullAllStores, pushAllStores, flushPendingPushes } from './services/cloudSync'
import { useCloudAuth } from './context/CloudAuthContext'
import { ensureSupabaseAccountForStremioUser } from './services/cloudAuth'
import Titlebar from './components/Titlebar'
import CatalogExpandedView from './components/CatalogExpandedView'
import DiscoverView from './components/DiscoverView'
import UpdaterBanner from './components/UpdaterBanner'
import LandingPage from './components/LandingPage'










function NavIcon({ icon: Icon, active = false, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`glass-clear glass-interactive relative w-14 h-14 flex items-center justify-center rounded-full transition-colors duration-200 ${
        active
          ? 'bg-accent/15 text-accent shadow-lg shadow-accent/30'
          : 'text-neutral-500 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/10 hover:text-neutral-900 dark:hover:text-white'
      }`}
    >
      <Icon className="w-6 h-6" />
    </button>
  )
}

function handleGoHome(setters) {
  const { setActiveView, setExpandedCatalog, mainRef, setSelectedMovie } = setters
  setActiveView('home')
  setExpandedCatalog(null)
  if (setSelectedMovie) setSelectedMovie(null)
  try { mainRef?.current?.scrollTo({ top: 0, behavior: 'smooth' }) } catch {}
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
























function App() {
  const { resolvedTheme, setThemeMode } = useTheme()
  const mainRef = useRef(null)
  const [selectedMovie, setSelectedMovie] = useState(null)
  const [playingMovie, setPlayingMovie] = useState(null)
  const [minimizedMovie, setMinimizedMovie] = useState(null)
  const [isLoginOpen, setIsLoginOpen] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [activeView, setActiveView] = useState('home')
  const [hoverAutoplayEnabled, setHoverAutoplayEnabled] = useState(true)
  const [continueWatching, setContinueWatching] = useState(() => getContinueWatchingList())
  const [expandedCatalog, setExpandedCatalog] = useState(null) // { title, movies } for See all
  function handleExpandCatalog(title, movies) {
    setExpandedCatalog({ title, movies })
    try { mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' }) } catch {}
  }
  const { activeProfileId: ctxActiveProfileId } = useProfileContext()
  const { user: cloudUser, isCloudConfigured } = useCloudAuth()
  // Strict RLS: cloudUserId is Supabase auth.uid(). Periodic sync (30s) + debounced pushes run when cloudUser exists.
  const cloudUserId = cloudUser?.id || null

  // Quiet auto-provision: once per Stremio login per session, with backoff. Silent on network failure.
  const autoProvisionAttemptedRef = useRef(null)
  useEffect(() => {
    if (!currentUser?._id || !isCloudConfigured || cloudUser?.id) return
    const attemptKey = `stremio_supabase_autoprovision:${currentUser._id}`
    if (autoProvisionAttemptedRef.current === currentUser._id) return
    try {
      if (sessionStorage.getItem(attemptKey)) return
    } catch {}
    autoProvisionAttemptedRef.current = currentUser._id
    try { sessionStorage.setItem(attemptKey, '1') } catch {}
    // Defer slightly so initial render isn't blocked; silent on failure
    const t = setTimeout(() => {
      ensureSupabaseAccountForStremioUser(currentUser).then((u) => {
        if (u?.id) console.debug('[App] Supabase auto-provision linked for', currentUser._id)
      }).catch(() => {})
    }, 1200)
    return () => clearTimeout(t)
  }, [currentUser, cloudUser?.id, isCloudConfigured])

  // Profile data hydration & isolation — strict per-profile data
  useEffect(() => {
    if (!ctxActiveProfileId) return
    setContinueWatching(getContinueWatchingList())
  }, [ctxActiveProfileId])



  // Pulls cloud-synced stores (profiles, per-profile watch progress / watched / viewing logs,
  // queue, addon lists, user settings) as soon as a Supabase Auth id is available.
  // Per-profile stores are merged by updatedAt (cloudSync.js), not blind overwrite.
  // Any offline-queued pushes are flushed first, so a pull can't clobber local changes made while offline with stale data.
  useEffect(() => {
    if (!cloudUserId) return
    let cancelled = false




    flushPendingPushes(cloudUserId).then(() => {
      if (cancelled) return
      return pullAllStores(cloudUserId)
    }).then(() => {
      if (cancelled) return
      // Hydrate Remote Streaming URL from cloud userSettings for cross-device carryover
      try {
        const raw = localStorage.getItem('stremio_user_settings')
        if (raw) {
          const parsed = JSON.parse(raw)
          const cloudUrl = parsed?.streamingSettings?.streamingServerUrl
          if (cloudUrl && typeof cloudUrl === 'string' && cloudUrl.trim()) {
            const localRaw = localStorage.getItem('stremio_streaming_server_settings')
            const local = localRaw ? JSON.parse(localRaw) : {}
            if (!local.streamingServerUrl || !local.streamingServerUrl.trim()) {
              localStorage.setItem(
                'stremio_streaming_server_settings',
                JSON.stringify({ ...local, streamingServerUrl: cloudUrl.trim() })
              )
              window.dispatchEvent(new CustomEvent('stremio:streaming-server-url-changed'))
            }
          }
        }
      } catch {}
      // Refresh Continue Watching from merged cloud+local per-profile data
      setContinueWatching(getContinueWatchingList())
      try {
        window.dispatchEvent(new CustomEvent('stremio:profiles-pulled'))
        window.dispatchEvent(new CustomEvent('stremio:viewing-log-changed'))
      } catch {}
    })




    return () => {
      cancelled = true
    }
  }, [cloudUserId])




  // Local watch-progress changes (every periodic save + pause + exit,
  // from PlayerView) dispatch this event — listening here means Continue
  // Watching updates the moment progress changes, not only when the
  // player happens to close (the previous behavior, driven off
  // playingMovie transitioning to null, which missed pause-only saves
  // entirely while the player stays open).
  useEffect(() => {
    function handleProgressChanged() {
      setContinueWatching(getContinueWatchingList())
    }
    window.addEventListener('stremio:watch-progress-changed', handleProgressChanged)
    return () => window.removeEventListener('stremio:watch-progress-changed', handleProgressChanged)
  }, [])








  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState('All')
  const [watchlistItems, setWatchlistItems] = useState([])
  const [isLoadingWatchlist, setIsLoadingWatchlist] = useState(false)
  const [isProfileHubOpen, setIsProfileHubOpen] = useState(false)
  const [isSyncingProfile, setIsSyncingProfile] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')








  const { items: trendingMovies, isLoading: isLoadingTrending, error: trendingError } = useCinemetaCatalog('movie', 'top')
  const { items: newReleases, isLoading: isLoadingNewReleases, error: newReleasesError } = useCinemetaCatalog('movie', 'year')
  const { items: popularSeries, isLoading: isLoadingSeries, error: seriesError } = useCinemetaCatalog('series', 'top')
  const [addonCatalogRows, setAddonCatalogRows] = useState([])
  const [isLoadingAddonCatalogs, setIsLoadingAddonCatalogs] = useState(false)








  useEffect(() => {
    let cancelled = false


    function loadCatalogRows() {
      setIsLoadingAddonCatalogs(true)
      fetchAllCatalogRows().then((rows) => {
        if (!cancelled) {
          setAddonCatalogRows(rows)
          setIsLoadingAddonCatalogs(false)
        }
      })
    }


    loadCatalogRows()


    // addonConfig.js dispatches this on every install/remove/toggle — this
    // was previously unlistened-for, meaning Home's catalog rows were
    // fetched once on mount and never again. An addon installed after
    // that (i.e. in every real usage) would save correctly but never
    // visibly appear anywhere, since nothing ever refetched.
    window.addEventListener('stremio:installed-addons-changed', loadCatalogRows)


    return () => {
      cancelled = true
      window.removeEventListener('stremio:installed-addons-changed', loadCatalogRows)
    }
  }, [])
























  useEffect(() => {
    if (isLoggedIn()) {
      getUser()
        .then((user) => {
          setCurrentUser(user)
          return getAddonCollection()
        })
        .catch(() => setCurrentUser(null))
    }
  }, [])








  useEffect(() => {
    if (playingMovie === null) {
      setContinueWatching(getContinueWatchingList())
    }
  }, [playingMovie])








  useEffect(() => {
    if (!currentUser) {
      setWatchlistItems([])
      return
    }
    let cancelled = false
    setIsLoadingWatchlist(true)
    getLibrary()
      .then((rawItems) => {
        if (cancelled) return
        setWatchlistItems(
          rawItems
            .filter((item) => !item.removed)
            .map((item) => ({
              imdbId: item._id,
              title: item.name || 'Untitled',
              year: item.year || '',
              posterUrl: item.poster || 'https://placehold.co/400x600/1a1a2e/ffffff?text=No+Poster',
              backdropUrl: item.poster,
              description: item.description || '',
              type: item.type || 'movie',
              videoUrl: null,
            }))
        )
        setIsLoadingWatchlist(false)
      })
      .catch(() => {
        if (!cancelled) {
          setWatchlistItems([])
          setIsLoadingWatchlist(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [currentUser])








  const allKnownMovies = useMemo(() => {
    const pools = [
      continueWatching,
      trendingMovies,
      newReleases,
      popularSeries,
      ...addonCatalogRows.map((row) => row.movies),
    ]








    const seen = new Map()
    for (const pool of pools) {
      for (const movie of pool) {
        const key = movie.imdbId || movie.title
        if (!seen.has(key)) seen.set(key, movie)
      }
    }
    return Array.from(seen.values())
  }, [continueWatching, trendingMovies, newReleases, popularSeries, addonCatalogRows])








  const isSearchActive = searchQuery.trim().length > 0 || activeFilter !== 'All'
  const trimmedQuery = searchQuery.trim()

  // If user starts searching or switches view, close any expanded catalog (Stremio behavior)
  useEffect(() => {
    if (isSearchActive || activeView !== 'home') {
      setExpandedCatalog(null)
    }
  }, [isSearchActive, activeView])








  const { items: remoteSearchItems, isLoading: isSearchingRemote, error: remoteSearchError } = useCinemetaSearch(trimmedQuery)








  const searchResults = useMemo(() => {
    if (!isSearchActive) return []








    if (activeFilter === 'Watchlist') {
      let pool = watchlistItems
      if (trimmedQuery) {
        const q = trimmedQuery.toLowerCase()
        pool = pool.filter((m) => m.title && m.title.toLowerCase().includes(q))
      }
      return pool
    }








    let pool
    if (trimmedQuery) {
      const q = trimmedQuery.toLowerCase()
      const localMatches = allKnownMovies.filter((m) => m.title && m.title.toLowerCase().includes(q))
      const seen = new Map()
      for (const movie of [...remoteSearchItems, ...localMatches]) {
        const key = movie.imdbId || movie.title
        if (!seen.has(key)) seen.set(key, movie)
      }
      pool = Array.from(seen.values())
    } else {
      pool = allKnownMovies
    }








    if (activeFilter === 'Movies') {
      pool = pool.filter((m) => (m.type || 'movie') === 'movie')
    } else if (activeFilter === 'Series') {
      pool = pool.filter((m) => m.type === 'series')
    } else if (activeFilter === 'Live TV') {
      pool = pool.filter((m) => ['tv','channel','live'].includes(String(m.type||'').toLowerCase()) || m.isLive)
    }








    return pool
  }, [isSearchActive, activeFilter, trimmedQuery, allKnownMovies, watchlistItems, remoteSearchItems])
























  function handlePlaySomething() {
    const source = watchlistItems.length > 0 ? watchlistItems : trendingMovies
    const playableTitles = source.filter((movie) => movie && movie.title)
    if (playableTitles.length === 0) return








    const movie = playableTitles[Math.floor(Math.random() * playableTitles.length)]
    setSearchQuery('')
    setActiveFilter('All')
    setActiveView('home')
    setSelectedMovie(movie)
  }








  function handleSettingsLogout() {
    logout().then(() => setCurrentUser(null))
  }








  function handleProfileHubLogout() {
    logout().then(() => {
      setCurrentUser(null)
      setIsProfileHubOpen(false)
    })
  }








  async function handleProfileSync() {
    setIsSyncingProfile(true)
    setSyncMessage('')
    try {
      const profile = await syncStremioProfile()
      const counts = [
        profile.addons ? `${profile.addons.length} add-ons` : null,
        profile.library ? `${profile.library.filter((item) => !item.removed).length} library items` : null,
      ].filter(Boolean)
      setSyncMessage(counts.length ? `Synced ${counts.join(' and ')}.` : 'Cloud sync completed with no new data.')




      // Cloud sync (Supabase) is separate from Stremio's own account sync
      // above — push whatever's changed locally since the last sync.
      // Failures here are non-fatal to the sync message; pushStore
      // already queues failed pushes for retry via flushPendingPushes on
      // next login, so this isn't a silent data-loss risk.
      if (cloudUserId) {
        await pushAllStores(cloudUserId)
      }




      if (profile.library) {
        setWatchlistItems(profile.library.filter((item) => !item.removed).map((item) => ({
          imdbId: item._id,
          title: item.name || 'Untitled',
          year: item.year || '',
          posterUrl: item.poster || 'https://placehold.co/400x600/1a1a2e/ffffff?text=No+Poster',
          backdropUrl: item.poster,
          description: item.description || '',
          type: item.type || 'movie',
          videoUrl: null,
        })))
      }








    } catch (err) {
      setSyncMessage(err.message || 'Cloud sync failed.')
    } finally {
      setIsSyncingProfile(false)
    }
  }








  function handlePreferencesChange(preferences) {
    if (currentUser) {
      saveProfileSettings(preferences).catch((err) => {
        console.warn('Failed to sync profile preferences:', err.message)
      })
    }
  }








  const heroDescription = 'A rogue courier navigates a city where memories can be traded like currency, uncovering a conspiracy that threatens to rewrite the past.'








  return (
    <>
    <div
      id="app-root"
      className={`spatial-scene relative z-10 flex flex-col h-screen w-screen p-4 gap-0 text-neutral-900 dark:text-neutral-100 transition-colors duration-300 ${playingMovie ? 'is-playing' : ''}`}
      style={{ background: 'var(--bg-base)', transition: 'background 0.4s ease, color 0.4s ease' }}
    >
      <Titlebar />
      <UpdaterBanner />
      <div className="flex flex-1 gap-4 min-h-0">








      <aside className="depth-content floating-layer glass-regular w-24 rounded-3xl flex flex-col items-center py-8 gap-5 shrink-0">








        <div className="flex flex-col items-center mb-2 select-none" title="Stremio+">
          <span
            className={`text-[11px] font-semibold tracking-wide ${resolvedTheme === 'dark' ? 'bg-clip-text text-transparent' : 'text-neutral-700'}`}
            style={
              resolvedTheme === 'dark'
                ? { backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.55))' }
                : undefined
            }
          >
            Stremio
          </span>
          <span
            className="text-lg font-bold text-accent leading-none mt-0.5"
            style={{ textShadow: '0 0 12px var(--accent, currentColor)' }}
          >
            +
          </span>
        </div>
        <div className="w-8 h-px bg-white/10 mb-1" />








        <NavIcon icon={Home} active={activeView === 'home'} onClick={() => handleGoHome({ setActiveView, setExpandedCatalog, mainRef, setSelectedMovie })} />
        <NavIcon icon={Compass} active={activeView === 'discover'} onClick={() => { setActiveView('discover'); setExpandedCatalog(null); try { mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' }) } catch {} }} />
        <NavIcon icon={Bookmark} active={activeView === 'library'} onClick={() => setActiveView('library')} />
        <NavIcon icon={Info} active={activeView === 'landing'} onClick={() => { setActiveView('landing'); setExpandedCatalog(null); try { mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' }) } catch {} }} />
        <button
          onClick={handlePlaySomething}
          disabled={watchlistItems.length === 0 && trendingMovies.length === 0}
          className="glass-clear glass-interactive relative w-14 h-14 flex items-center justify-center rounded-full text-neutral-500 dark:text-neutral-400 hover:bg-accent/15 hover:text-accent transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          title={watchlistItems.length > 0 ? 'Play Something from your watchlist' : 'Play Something from trending'}
          aria-label="Play Something"
        >
          <Dices className="w-6 h-6" />
        </button>








        <div className="flex-1" />








        <button
          onClick={() => setThemeMode(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="glass-clear glass-interactive relative w-14 h-14 flex items-center justify-center rounded-full text-neutral-500 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/10 hover:text-neutral-900 dark:hover:text-white transition-colors duration-200"
        >
          {resolvedTheme === 'dark' ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
        </button>
        <NavIcon icon={Settings} active={activeView === 'settings'} onClick={() => setActiveView('settings')} />
      </aside>








      <main
        ref={mainRef}
        className={`depth-content content-layer flex-1 rounded-3xl px-6 pb-4 pt-4 scroll-smooth overscroll-contain ${
          activeView === 'settings' ? 'overflow-hidden' : 'overflow-y-auto'
        }`}
        style={{ overscrollBehavior: 'contain' }}
      >
        {(activeView !== 'settings' && activeView !== 'addons' && activeView !== 'discover' && activeView !== 'landing') && (
          <div className="depth-header mb-3 flex items-center gap-4">
            <div className="flex-1">
              <ControlBar
                searchQuery={searchQuery}
                onSearchChange={(value) => {
                  setSearchQuery(value)
                  if (activeView !== 'home') setActiveView('home')
                }}
                activeFilter={activeFilter}
                onFilterChange={(filter) => {
                  setActiveFilter(filter)
                  if (activeView !== 'home') setActiveView('home')
                }}
              />
            </div>
          </div>
        )}








        {activeView === 'home' && isSearchActive && (
          <div>
            <SectionHeading>
              {trimmedQuery ? `Results for "${trimmedQuery}"` : `${activeFilter}`}
            </SectionHeading>








            {activeFilter !== 'Watchlist' && trimmedQuery && remoteSearchError && (
              <p className="text-xs text-red-400 mb-4">
                Couldn't reach Cinemeta search, showing local matches only: {remoteSearchError}
              </p>
            )}








            {activeFilter === 'Watchlist' && isLoadingWatchlist ? (
              <MovieGridSkeleton count={6} />
            ) : activeFilter === 'Watchlist' && !currentUser ? (
              <div className="glass-panel rounded-3xl p-12 flex flex-col items-center justify-center text-center gap-3">
                <Bookmark className="w-10 h-10 text-neutral-400 dark:text-neutral-500" />
                <h3 className="text-lg font-medium">Sign in to filter by Watchlist</h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-sm">
                  Your saved titles will show up here once you're signed in with your Stremio account.
                </p>
              </div>
            ) : activeFilter !== 'Watchlist' && trimmedQuery && isSearchingRemote && searchResults.length === 0 ? (
              <MovieGridSkeleton count={6} />
            ) : searchResults.length === 0 ? (
              <div className="glass-panel rounded-3xl p-12 flex flex-col items-center justify-center text-center gap-3">
                <SearchX className="w-10 h-10 text-neutral-400 dark:text-neutral-500" />
                <h3 className="text-lg font-medium">No matches found</h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-sm">
                  Try a different search term or filter.
                </p>
              </div>
            ) : (
              <VirtualizedMovieGrid movies={searchResults} onSelectMovie={setSelectedMovie} />
            )}
          </div>
        )}








        {activeView === 'home' && !isSearchActive && (
          <>
            {expandedCatalog ? (
              <CatalogExpandedView
                title={expandedCatalog.title}
                movies={expandedCatalog.movies}
                onBack={() => {
                  setExpandedCatalog(null)
                  try { mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' }) } catch {}
                }}
                onSelectMovie={expandedCatalog.title === 'Continue Watching' ? setPlayingMovie : setSelectedMovie}
              />
            ) : (
              <>
            {(isLoadingTrending || trendingMovies.length > 0) && (
              <HeroBanner
                items={trendingMovies.map((movie) => ({
                  ...movie,
                  description: movie.description || heroDescription,
                }))}
                isLoading={isLoadingTrending}
                onMoreInfo={(movie) => setSelectedMovie(movie)}
                onPlay={(movie) => setPlayingMovie(movie)}
              />
            )}








            {continueWatching.length > 0 && (
              <ContentRow
                title="Continue Watching"
                movies={continueWatching}
                onSelectMovie={setPlayingMovie}
                hoverAutoplayEnabled={hoverAutoplayEnabled}
                onSeeAll={() => handleExpandCatalog('Continue Watching', continueWatching)}
              />
            )}








            {trendingError && <p className="text-sm text-red-400 mb-6">Couldn't load Trending: {trendingError}</p>}
            {!trendingError && (isLoadingTrending ? (
              <>
                <SectionHeading>Trending Now</SectionHeading>
                <MovieRowSkeleton />
              </>
            ) : (
              <ContentRow title="Trending Now" movies={trendingMovies} onSelectMovie={setSelectedMovie} hoverAutoplayEnabled={hoverAutoplayEnabled} onSeeAll={() => handleExpandCatalog('Trending Now', trendingMovies)} />
            ))}








            {newReleasesError && <p className="text-sm text-red-400 mb-6">Couldn't load New Releases: {newReleasesError}</p>}
            {!newReleasesError && (isLoadingNewReleases ? (
              <>
                <SectionHeading>New Releases</SectionHeading>
                <MovieRowSkeleton />
              </>
            ) : (
              <ContentRow title="New Releases" movies={newReleases} onSelectMovie={setSelectedMovie} hoverAutoplayEnabled={hoverAutoplayEnabled} onSeeAll={() => handleExpandCatalog('New Releases', newReleases)} />
            ))}








            {seriesError && <p className="text-sm text-red-400 mb-6">Couldn't load Popular Series: {seriesError}</p>}
            {!seriesError && (isLoadingSeries ? (
              <>
                <SectionHeading>Popular Series</SectionHeading>
                <MovieRowSkeleton />
              </>
            ) : (
              <ContentRow title="Popular Series" movies={popularSeries} onSelectMovie={setSelectedMovie} hoverAutoplayEnabled={hoverAutoplayEnabled} onSeeAll={() => handleExpandCatalog('Popular Series', popularSeries)} />
            ))}








            {isLoadingAddonCatalogs && (
              <MovieRowSkeleton />
            )}
            {addonCatalogRows.map((row) => (
              <ContentRow
                key={row.key}
                title={row.title}
                movies={row.movies}
                onSelectMovie={setSelectedMovie}
                hoverAutoplayEnabled={hoverAutoplayEnabled}
                onSeeAll={() => handleExpandCatalog(row.title, row.movies)}
              />
            ))}
              </>
            )}
          </>
        )}








        {activeView === 'discover' && (
          <DiscoverView onSelectMovie={setSelectedMovie} />
        )}

        {activeView === 'library' && (
          <LibrarySection isLoggedIn={!!currentUser} onSelectMovie={setSelectedMovie} />
        )}








        {activeView === 'addons' && (
          <AddonsPage onBack={() => setActiveView('settings')} />
        )}








        {activeView === 'settings' && (
          <SettingsPage
            user={currentUser}
            onOpenLogin={() => setIsLoginOpen(true)}
            onLogout={handleSettingsLogout}
            onOpenAddons={() => setActiveView('addons')}
            onOpenInsights={() => setIsProfileHubOpen(true)}
            hoverAutoplayEnabled={hoverAutoplayEnabled}
            onToggleHoverAutoplay={() => setHoverAutoplayEnabled(!hoverAutoplayEnabled)}
            onPreferencesChange={handlePreferencesChange}
          />
        )}

        {activeView === 'landing' && (
          <LandingPage onEnterApp={() => { setActiveView('home'); try { mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' }) } catch {} }} />
        )}
      </main>
      </div>

      <BackToTop scrollContainerRef={mainRef} />








      <DetailModal
        movie={selectedMovie}
        onClose={() => setSelectedMovie(null)}
        onPlay={(movieArg) => {
          setPlayingMovie(movieArg || selectedMovie)
          setSelectedMovie(null)
        }}
        onRequireLogin={() => {
          setSelectedMovie(null)
          setIsLoginOpen(true)
        }}
        onPlayTrailer={(movie) => {
          setSelectedMovie(null)
          setPlayingMovie({ ...movie, videoUrl: null, isTrailer: true })
        }}
      />








      <PlayerView
        movie={playingMovie}
        onClose={() => setPlayingMovie(null)}
        onStreamFailBack={(failMovie) => {
          setPlayingMovie(null)
          if (failMovie) setSelectedMovie(failMovie)
        }}
        onMinimize={({ movie: mv, poster, thumbnailSrc }) => {
          setMinimizedMovie({ movie: mv, poster, thumbnailSrc })
          setPlayingMovie(null)
        }}
        cloudUserId={cloudUserId}
        onNextEpisode={({ series, nextEpisode }) => {
          setPlayingMovie(null)
          // Open detail for next episode pre-selected; DetailModal will honor season/episode
          const base = series || playingMovie
          if (!base || !nextEpisode) return
          const nextMovie = {
            ...base,
            season: nextEpisode.season,
            episode: nextEpisode.episode ?? nextEpisode.number,
            episodeId: nextEpisode.id,
            episodeTitle: nextEpisode.title || nextEpisode.name,
            episodeThumbnail: nextEpisode.thumbnail,
            displayTitle: `${base.title} — S${String(nextEpisode.season).padStart(2,'0')}E${String(nextEpisode.episode ?? nextEpisode.number).padStart(2,'0')} ${nextEpisode.title ? `· ${nextEpisode.title}` : ''}`.trim(),
            videos: base.videos || null,
          }
          // Small delay so PlayerView exit transition finishes before detail opens
          setTimeout(() => setSelectedMovie(nextMovie), 220)
        }}
      />








      {minimizedMovie && (
        <div
          onClick={() => {
            setPlayingMovie(minimizedMovie.movie)
            setMinimizedMovie(null)
          }}
          className="fixed bottom-6 right-6 z-50 w-56 h-32 rounded-2xl overflow-hidden shadow-2xl cursor-pointer transition-transform duration-300 hover:scale-105"
          role="button"
          aria-label={`Restore ${minimizedMovie.movie.title}`}
        >
          <div className="absolute inset-0 bg-black/40 transition-opacity duration-500" />








          <img
            src={minimizedMovie.poster || minimizedMovie.movie.posterUrl || minimizedMovie.movie.backdropUrl}
            alt={minimizedMovie.movie.title}
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500"
          />








          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />








          <div className="relative z-10 h-full p-3 flex flex-col justify-end">
            <p className="text-sm font-semibold text-white truncate">{minimizedMovie.movie.title}</p>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setMinimizedMovie(null)
                }}
                className="glass-interactive w-9 h-9 rounded-full flex items-center justify-center text-white/90"
                title="Close mini player"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}








    </div>








      <ProfileInsightsModal
        isOpen={isProfileHubOpen}
        onClose={() => setIsProfileHubOpen(false)}
        user={currentUser}
        onLogout={handleProfileHubLogout}
        onSync={handleProfileSync}
        isSyncing={isSyncingProfile}
        syncMessage={syncMessage}
      />








      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onLoginSuccess={(result) => {
          setCurrentUser(result.user)
          if (result.profile?.settings) {
            if (result.profile.settings.themeMode === 'light' || result.profile.settings.themeMode === 'dark' || result.profile.settings.themeMode === 'system') {
              setThemeMode(result.profile.settings.themeMode)
            }
            if (typeof result.profile.settings.hoverAutoplayEnabled === 'boolean') {
              setHoverAutoplayEnabled(result.profile.settings.hoverAutoplayEnabled)
            }
          }
          setIsLoginOpen(false)
        }}
      />
    </>
  )
}








export default App