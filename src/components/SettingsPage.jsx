import { useState, useRef, useEffect, createContext, useContext } from 'react'
import {
  User, Puzzle, LogOut, ChevronRight, ChevronDown, Download, Upload, Link2,
  Globe, LogOut as QuitIcon, Maximize, EyeOff,
  Subtitles, Bell, Cpu, PauseCircle,
  Database, Gauge,
  Mail,
  PlayCircle, HardDrive, Trash2, Search,
  Palette, AudioLines, Flame,
} from 'lucide-react'
import GlassToggle from './GlassToggle'
import { useProfileContext } from '../context/ProfileContext'
import { exportProgressAsJSON, importProgressFromJSON } from '../utils/watchProgress'
import { getServerCacheInfo, purgeServerCache, getLocalStorageInfo, purgeLocalStorageCache } from '../utils/cacheManager'
import { getApiKey, setApiKey } from '../utils/openSubtitles'


import { isSpatialAudioEnabled, setSpatialAudioEnabled } from '../utils/spatialAudioPreference'
import { DEFAULT_STREAMING_SETTINGS, getStreamingSettings, saveStreamingSettings, getStreamingServerBaseUrl, DEFAULT_STREAMING_SERVER_BASE, CACHE_SIZE_OPTIONS } from '../utils/streamingSettings'
import StreamingSettings from './settings/StreamingSettings'
import { useTheme } from '../context/ThemeProvider'
import { useSupabase } from '../context/SupabaseContext'
import { useCloudAuth } from '../context/CloudAuthContext'
import { ensureSupabaseAccountForStremioUser } from '../services/cloudAuth'
import { useStreamingServerHealth } from '../hooks/useStreamingServerHealth'


const SettingsFilterContext = createContext('')


function HighlightMatch({ children, query }) {
  if (!query || typeof children !== 'string') return children
  const parts = children.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'))
  return parts.map((part, index) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={index} className="rounded bg-accent/30 px-0.5 text-inherit">{part}</mark>
      : part
  )
}


function SettingsSection({ title, category, children }) {
  const query = useContext(SettingsFilterContext)
  // Continuous scroll: all sections render; activeCategory drives nav highlight via scrollspy (handled outside)
  const sectionId = `settings-${category}-${title.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div id={sectionId} data-category={category} className="mb-8 scroll-mt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-3 px-1">
        {title}
      </h3>
      <div className="glass-panel rounded-2xl divide-y divide-black/5 dark:divide-white/10 overflow-hidden">
        <SettingsFilterContext.Provider value={query}>{children}</SettingsFilterContext.Provider>
      </div>
    </div>
  )
}


function SettingsRow({ icon: Icon, label, description, right, onClick }) {
  const query = useContext(SettingsFilterContext)
  if (query && !`${label} ${typeof description === 'string' ? description : ''}`.toLowerCase().includes(query.toLowerCase())) return null
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`w-full flex items-center gap-4 px-5 py-4 text-left cursor-pointer ${onClick ? 'glass-interactive hover:bg-black/5 dark:hover:bg-white/5 transition-colors duration-200' : ''}`}
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <div className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center shrink-0 pointer-events-none">
        <Icon className="w-4.5 h-4.5 pointer-events-none" />
      </div>
      <div className="flex-1 min-w-0 pointer-events-none">
        <p className="text-sm font-medium"><HighlightMatch query={query}>{label}</HighlightMatch></p>
        {description && <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5"><HighlightMatch query={query}>{description}</HighlightMatch></p>}
      </div>
      {right && <div className="shrink-0" onClick={(e) => e.stopPropagation()}>{right}</div>}
    </Wrapper>
  )
}


function ButtonGroup({ options, value, onChange }) {
  return (
    <div className="flex items-center gap-1 glass-capsule px-1 py-1">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors duration-200 ${
            value === opt ? 'bg-accent text-white' : 'text-neutral-500 dark:text-neutral-400'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}


function downloadJSONFile(filename, jsonString) {
  const blob = new Blob([jsonString], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}


const SHORTCUTS = [
  { keys: 'Space', action: 'Play / Pause' },
  { keys: '←  /  →', action: 'Seek backward / forward' },
  { keys: '↑  /  ↓', action: 'Volume up / down' },
  { keys: 'F', action: 'Toggle fullscreen' },
  { keys: 'M', action: 'Mute / Unmute' },
  { keys: 'D', action: 'Toggle player statistics' },
  { keys: 'Esc', action: 'Exit fullscreen' },
]


function SettingsPage({ user, onOpenLogin, onLogout, onOpenAddons, onOpenInsights, hoverAutoplayEnabled, onToggleHoverAutoplay, onPreferencesChange }) {
  const { activeProfile, updateProfile } = useProfileContext()


  // Per-profile, not a global app setting (unlike most of this file's
  // other toggles) — per the request, this needs to be readable per
  // profile so ProfileRing can check "is this ENABLED FOR THIS PROFILE",
  // not just app-wide. Routed through ProfileContext's own
  // updateProfile/preferences rather than the debounced onPreferencesChange
  // bag above, which is app-level settings, not profile preferences.
  const showAchievementRings = activeProfile?.preferences?.showAchievementRings ?? true


  function handleToggleAchievementRings(enabled) {
    updateProfile({
      ...activeProfile,
      preferences: { ...activeProfile.preferences, showAchievementRings: enabled },
    })
  }


  const { themeMode, setThemeMode } = useTheme()
  const importInputRef = useRef(null)
  const [activeCategory, setActiveCategory] = useState('General')
  const [searchQuery, setSearchQuery] = useState('')
  const [importMessage, setImportMessage] = useState('')
  const [traktEnabled, setTraktEnabled] = useState(false)
  const [quitOnClose, setQuitOnClose] = useState(false)
  const [escExitsFullscreen, setEscExitsFullscreen] = useState(true)
  const [blurSpoilers, setBlurSpoilers] = useState(false)


  const [autoplayNext, setAutoplayNext] = useState(true)
  const [nextEpisodeNotification, setNextEpisodeNotification] = useState(true)
  const [hardwareDecoding, setHardwareDecoding] = useState(true)
  const [restartRequired, setRestartRequired] = useState(false)
  const [isRelaunching, setIsRelaunching] = useState(false)


  // The main process is the source of truth for this one — it's the only
  // place that actually knows what the currently-running session launched
  // with, since the setting takes effect via Chromium command-line flags
  // that can only be read at startup, before app.whenReady().
  useEffect(() => {
    if (!window.electronAPI?.getHardwareDecodingStatus) return
    window.electronAPI.getHardwareDecodingStatus().then((status) => {
      setHardwareDecoding(status.hardwareDecodingPreference)
    })
  }, [])
  const [pauseOnMinimize, setPauseOnMinimize] = useState(false)
  const [normalizeByDefault, setNormalizeByDefault] = useState(false)
  const [spatialAudio, setSpatialAudio] = useState(() => isSpatialAudioEnabled())
  const [subtitleSize, setSubtitleSize] = useState('medium')
  const [seekSeconds, setSeekSeconds] = useState('10')
  const [subtitleApiKey, setSubtitleApiKey] = useState(() => getApiKey())
  const [subtitleApiKeySaved, setSubtitleApiKeySaved] = useState(() => !!getApiKey())


  const [cacheSize, setCacheSize] = useState('2gb')
  const [storageInfo, setStorageInfo] = useState(null)
  const [isPurging, setIsPurging] = useState(false)
  const [purgeMessage, setPurgeMessage] = useState('')
  const [streamingSettings, setStreamingSettings] = useState(DEFAULT_STREAMING_SETTINGS)
  const [streamingServerConnected, setStreamingServerConnected] = useState(false)
  const { isSyncing, lastSyncedAt, syncNow } = useSupabase()
  const { user: cloudUser, isCloudConfigured } = useCloudAuth()
  const { status: serverHealth, lastCheckedAt: healthCheckedAt, restartAndRecheck } = useStreamingServerHealth()
  const [isRestartingServer, setIsRestartingServer] = useState(false)
  const [isEnablingCloud, setIsEnablingCloud] = useState(false)
  const [cloudEnableError, setCloudEnableError] = useState('')
  const [cloudKeyMismatch, setCloudKeyMismatch] = useState('')
  const [cloudEnableCooldown, setCloudEnableCooldown] = useState(0)


  const categories = [
    { id: 'General', label: 'General', icon: User },
    { id: 'Appearance', label: 'Appearance', icon: Palette },
    { id: 'Playback', label: 'Playback & Subtitles', icon: PlayCircle },
    { id: 'Streaming & Add-ons', label: 'Streaming & Add-ons', icon: Puzzle },
  ]

  const settingsScrollRef = useRef(null)

  // Diagnose anon key vs URL mismatch (common cause of Invalid API key)
  useEffect(() => {
    try {
      const url = import.meta.env.VITE_SUPABASE_URL || ''
      const anon = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
      const hostRef = (() => { try { return new URL(url).hostname.split('.')[0] } catch { return '' } })()
      const jwtRef = (() => {
        try {
          const payload = JSON.parse(atob(anon.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
          return payload.ref || ''
        } catch { return '' }
      })()
      if (hostRef && jwtRef && hostRef !== jwtRef) {
        setCloudKeyMismatch(`anon key is for ${jwtRef} but URL is ${hostRef}.supabase.co — copy the anon key for ${hostRef} from Dashboard → Settings → API`)
      } else setCloudKeyMismatch('')
    } catch { setCloudKeyMismatch('') }
  }, [])

  // Cooldown timer for rate-limited Enable
  useEffect(() => {
    if (cloudEnableCooldown <= 0) return
    const t = setTimeout(() => setCloudEnableCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cloudEnableCooldown])

  async function handleEnableCloud() {
    if (!user?._id) { setCloudEnableError('Sign in to Stremio first'); return }
    if (cloudEnableCooldown > 0) return
    setIsEnablingCloud(true); setCloudEnableError('')
    try {
      const u = await ensureSupabaseAccountForStremioUser(user)
      if (!u) throw new Error('Could not enable cloud sync — try again')
      await syncNow()
    } catch (e) {
      const msg = e.message || String(e)
      // Supabase rate limit: "For security purposes, you can only request this after 55 seconds."
      const m = msg.match(/after (\d+) seconds/)
      if (m) {
        const secs = parseInt(m[1], 10) || 55
        setCloudEnableCooldown(secs + 2)
        setCloudEnableError(`Too many attempts — please wait ${secs} seconds and try again`)
      } else if (msg.includes('Confirm email')) {
        setCloudEnableError('Email confirmation required — disable it in Supabase Dashboard → Auth')
      } else {
        setCloudEnableError(msg)
      }
    } finally { setIsEnablingCloud(false) }
  }


  useEffect(() => {
    if (!onPreferencesChange) return undefined
    const timeoutId = setTimeout(() => {
      onPreferencesChange({
        traktEnabled,
        themeMode,
        quitOnClose,
        escExitsFullscreen,
        blurSpoilers,
        hoverAutoplayEnabled,
        autoplayNext,
        nextEpisodeNotification,
        hardwareDecoding,
        pauseOnMinimize,
        normalizeByDefault,
        subtitleSize,
        seekSeconds,
      })
    }, 500)
    return () => clearTimeout(timeoutId)
  }, [
    onPreferencesChange,
    traktEnabled,
    themeMode,
    quitOnClose,
    escExitsFullscreen,
    blurSpoilers,
    hoverAutoplayEnabled,
    autoplayNext,
    nextEpisodeNotification,
    hardwareDecoding,
    pauseOnMinimize,
    normalizeByDefault,
    subtitleSize,
    seekSeconds,
  ])


  async function updateStreamingSetting(patch) {
    const result = await saveStreamingSettings(patch)
    setStreamingSettings(result.settings)
    setStreamingServerConnected(result.connected)
  }


  function handleSpatialAudioChange(enabled) {
    setSpatialAudio(enabled)
    setSpatialAudioEnabled(enabled)
  }


  // Hardware acceleration can't be toggled live — it's a Chromium
  // command-line flag decided before app.whenReady() in electron.js.
  // This saves the new preference to disk (so it takes effect on the
  // *next* launch) and, if that differs from what this session actually
  // launched with, surfaces a restart prompt rather than letting the
  // toggle silently do nothing until the user happens to relaunch later.
  async function handleHardwareDecodingChange(enabled) {
    setHardwareDecoding(enabled)


    if (!window.electronAPI?.setHardwareDecoding) {
      // Not running inside Electron (e.g. a plain browser preview) —
      // nothing to persist or restart.
      return
    }


    const result = await window.electronAPI.setHardwareDecoding(enabled)
    setRestartRequired(!!result?.restartRequired)
  }


  async function handleRelaunch() {
    if (!window.electronAPI?.relaunchApp) return
    setIsRelaunching(true)
    await window.electronAPI.relaunchApp()
    // The process exits inside relaunchApp — this line only runs if that
    // somehow didn't happen (e.g. dev environment quirk), so we reset the
    // loading state rather than leaving the button stuck.
    setIsRelaunching(false)
  }


  async function loadStorageInfo() {
    const serverInfo = await getServerCacheInfo()
    if (serverInfo) {
      setStorageInfo(serverInfo)
    } else {
      setStorageInfo(getLocalStorageInfo())
    }
  }


  useEffect(() => {
    loadStorageInfo()
    getStreamingSettings().then(({ settings, connected }) => {
      setStreamingSettings(settings)
      setStreamingServerConnected(connected)
      if (settings.cacheSize) setCacheSize(settings.cacheSize)
    })
  }, [])

  // Keep streaming settings in sync when Remote Streaming URL is updated
  // via StreamingSettings.jsx (which writes to localStorage + dispatches
  // stremio:user-settings-changed). Without this, the parent's local
  // copy would stay stale until next mount.
  useEffect(() => {
    function handleServerUrlChanged(e) {
      try {
        // StreamingSettings dispatches with detail containing the full updated settings
        if (e?.detail?.streamingSettings) {
          setStreamingSettings((prev) => ({ ...prev, ...e.detail.streamingSettings }))
          if (e.detail.streamingSettings.cacheSize) setCacheSize(e.detail.streamingSettings.cacheSize)
          return
        }
        // Fallback: re-read local storage (covers cross-tab storage events)
        const raw = localStorage.getItem('stremio_streaming_server_settings')
        if (raw) {
          const parsed = JSON.parse(raw)
          setStreamingSettings((prev) => ({ ...prev, ...parsed }))
          if (parsed.cacheSize) setCacheSize(parsed.cacheSize)
        }
      } catch {}
    }
    window.addEventListener('stremio:user-settings-changed', handleServerUrlChanged)
    window.addEventListener('storage', handleServerUrlChanged)
    return () => {
      window.removeEventListener('stremio:user-settings-changed', handleServerUrlChanged)
      window.removeEventListener('storage', handleServerUrlChanged)
    }
  }, [])


  async function handlePurgeCache() {
    setIsPurging(true)
    setPurgeMessage('')


    if (storageInfo?.connected) {
      const success = await purgeServerCache()
      setPurgeMessage(success ? 'Streaming server cache cleared.' : 'Failed to clear server cache.')
    } else {
      purgeLocalStorageCache()
      setPurgeMessage('Local watch history cache cleared.')
    }


    await loadStorageInfo()
    setIsPurging(false)
  }


  function handleExportWatchHistory() {
    const json = exportProgressAsJSON()
    const dateStamp = new Date().toISOString().split('T')[0]
    downloadJSONFile(`stremio-plus-watch-history-${dateStamp}.json`, json)
  }


  function handleImportClick() {
    setImportMessage('')
    importInputRef.current?.click()
  }


  function handleImportFileSelected(e) {
    const file = e.target.files?.[0]
    if (!file) return


    const reader = new FileReader()
    reader.onload = () => {
      try {
        importProgressFromJSON(reader.result)
        setImportMessage('Watch history imported successfully. Reload the Home tab to see it.')
      } catch {
        setImportMessage('Import failed: the selected file is not a valid watch history export.')
      }
    }
    reader.readAsText(file)


    // Reset the input so selecting the same file again still fires onChange
    e.target.value = ''
  }


  return (
    <SettingsFilterContext.Provider value={searchQuery.trim()}>
    <div className="max-w-5xl h-full flex flex-col">
      <div className="mb-8 shrink-0">
        <h1 className="text-3xl font-semibold mb-5">Settings</h1>
        <label className="glass-panel flex items-center gap-3 rounded-2xl px-3 py-2 border border-white/10 shadow-lg shadow-black/5 max-w-md">
          <Search className="w-4 h-4 text-neutral-400 shrink-0" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search settings..."
            aria-label="Search settings"
            className="w-full bg-transparent text-sm outline-none placeholder:text-neutral-400"
          />
          {searchQuery && <button onClick={() => setSearchQuery('')} className="text-xs text-neutral-400 hover:text-white">Clear</button>}
        </label>
      </div>


      <div className="flex flex-col lg:flex-row gap-6 items-stretch min-h-0 flex-1">
        <nav className="glass-panel rounded-2xl p-2 w-full lg:w-56 shrink-0 self-start lg:sticky lg:top-0 max-h-[calc(100vh-200px)] overflow-y-auto" aria-label="Settings categories">
          {categories.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setActiveCategory(id)
                const firstSection = settingsScrollRef.current?.querySelector(`[data-category="${id}"]`)
                firstSection?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-all duration-200 cursor-pointer relative ${activeCategory === id
                  ? 'bg-accent/20 text-accent shadow-inner shadow-accent/10'
                  : 'text-neutral-500 dark:text-neutral-400 hover:bg-white/10 hover:text-neutral-900 dark:hover:text-white'
              }`}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <Icon className="w-4 h-4 shrink-0 pointer-events-none" />
              <span className="pointer-events-none flex-1 text-left">{label}</span>
            </button>
          ))}
        </nav>
        <div ref={settingsScrollRef} className="min-w-0 flex-1 w-full overflow-y-auto pr-1 pb-8 scroll-smooth overscroll-contain min-h-0" style={{ WebkitOverflowScrolling: 'touch' }}>


      <SettingsSection title="General" category="General">
        {user ? (
          <>
            <SettingsRow
              icon={User}
              label={user.email ? user.email.replace(/(.{2}).+(@.+)/, '$1***$2') : 'Signed in'}
              description="Stremio Account"
            />
            <SettingsRow icon={LogOut} label="Log Out" onClick={onLogout} right={<ChevronRight className="w-4 h-4 text-neutral-400" />} />
          </>
        ) : (
          <SettingsRow
            icon={User}
            label="Sign In"
            description="Sync your library and add-ons across devices"
            onClick={onOpenLogin}
            right={<ChevronRight className="w-4 h-4 text-neutral-400" />}
          />
        )}
        {onOpenInsights && (
          <SettingsRow
            icon={Flame}
            label="Profile Insights & Achievements"
            description="Watch time, streaks, badges, and your achievement tier"
            onClick={onOpenInsights}
            right={<ChevronRight className="w-4 h-4 text-neutral-400" />}
          />
        )}
        <SettingsRow icon={Puzzle} label="Add-ons" description="Manage installed add-ons" onClick={onOpenAddons} right={<ChevronRight className="w-4 h-4 text-neutral-400" />} />
        <SettingsRow icon={Download} label="Export Watch History" description="Download your Continue Watching data as a JSON file" onClick={handleExportWatchHistory} right={<ChevronRight className="w-4 h-4 text-neutral-400" />} />
        <SettingsRow icon={Upload} label="Import Watch History" description="Restore Continue Watching data from a previously exported file" onClick={handleImportClick} right={<ChevronRight className="w-4 h-4 text-neutral-400" />} />
        {importMessage && (
          <div className="px-5 py-3 text-xs text-neutral-500 dark:text-neutral-400 bg-black/5 dark:bg-white/5">
            {importMessage}
          </div>
        )}
        <input
          ref={importInputRef}
          type="file"
          accept="application/json"
          onChange={handleImportFileSelected}
          className="hidden"
        />
        <SettingsRow icon={Link2} label="Trakt Scrobbling" description="Sync watch history with your Trakt account" right={<GlassToggle checked={traktEnabled} onChange={setTraktEnabled} />} />
      </SettingsSection>


      <SettingsSection title="Interface" category="Appearance">
        <SettingsRow icon={Globe} label="Theme Mode" description="Choose between light, dark, or system theme" right={
          <div className="flex gap-2">
            {['light', 'dark', 'system'].map((mode) => (
              <button
                key={mode}
                onClick={() => setThemeMode(mode)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  themeMode === mode
                    ? 'bg-accent text-white'
                    : 'bg-white/10 text-neutral-300 hover:bg-white/20'
                }`}
              >
                {mode === 'light' ? 'Light' : mode === 'dark' ? 'Dark' : 'System'}
              </button>
            ))}
          </div>
        } />
        <SettingsRow icon={QuitIcon} label="Quit App on Window Close" description="Fully exit instead of running in the background" right={<GlassToggle checked={quitOnClose} onChange={setQuitOnClose} />} />
        <SettingsRow icon={Maximize} label="Escape Key Exits Fullscreen" description="Press Esc during playback to leave fullscreen" right={<GlassToggle checked={escExitsFullscreen} onChange={setEscExitsFullscreen} />} />
        <SettingsRow icon={EyeOff} label="Blur Unwatched Thumbnails" description="Hide spoilers for episodes you haven't seen yet" right={<GlassToggle checked={blurSpoilers} onChange={setBlurSpoilers} />} />
        <SettingsRow
          icon={Palette}
          label="Display Achievement Rings on Profiles"
          description="Show a tier-colored ring around this profile's avatar based on watch achievements"
          right={<GlassToggle checked={showAchievementRings} onChange={handleToggleAchievementRings} />}
        />
      </SettingsSection>


      <SettingsSection title="Player" category="Playback">
        <SettingsRow icon={PlayCircle} label="Autoplay Trailers on Hover" description="Preview trailers when hovering over posters" right={<GlassToggle checked={hoverAutoplayEnabled} onChange={onToggleHoverAutoplay} />} />
        <SettingsRow icon={Subtitles} label="Default Subtitles Size" right={<ButtonGroup options={['small', 'medium', 'large']} value={subtitleSize} onChange={setSubtitleSize} />} />
        <div className="px-5 py-4 flex flex-col gap-2 border-t border-black/5 dark:border-white/10">
          <div className="flex items-center gap-2">
            <Subtitles className="w-4 h-4 text-accent" />
            <p className="text-sm font-medium">OpenSubtitles API Key</p>
            {(subtitleApiKeySaved || (subtitleApiKey.trim() && subtitleApiKey.trim() === getApiKey())) && <span className="text-xs text-emerald-500 font-medium flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Saved</span>}
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Optional — for direct OpenSubtitles.com search. Leave empty to use installed subtitle addons (opensubtitles-v3 pre-installed works out-of-the-box).</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={subtitleApiKey}
              onChange={(e) => { setSubtitleApiKey(e.target.value); setSubtitleApiKeySaved(false) }}
              placeholder="Paste API key from opensubtitles.com/api"
              className="flex-1 px-3 py-2 rounded-xl bg-black/5 dark:bg-white/10 border border-black/5 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-accent placeholder:text-neutral-400"
            />
            {(subtitleApiKey.trim() && subtitleApiKey.trim() === getApiKey() && getApiKey()) ? (
              <button
                type="button"
                disabled
                className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-medium flex items-center gap-1.5 shrink-0 cursor-default"
                title="API key saved"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-4 h-4"><path d="M5 13l4 4L19 7" /></svg>
                Saved
              </button>
            ) : (
              <button
                onClick={() => { setApiKey(subtitleApiKey.trim()); setSubtitleApiKey(subtitleApiKey.trim()); setSubtitleApiKeySaved(true); }}
                className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors shrink-0"
              >
                Save
              </button>
            )}
          </div>
          <p className="text-[11px] text-neutral-400">Get free key at <a href="https://www.opensubtitles.com/api" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">opensubtitles.com/api</a></p>
        </div>
        <SettingsRow icon={Gauge} label="Arrow Keys Seek Time" right={<ButtonGroup options={['5', '10', '30']} value={seekSeconds} onChange={setSeekSeconds} />} />
        <SettingsRow icon={Bell} label="Autoplay Next Episode" right={<GlassToggle checked={autoplayNext} onChange={setAutoplayNext} />} />
        <SettingsRow icon={Bell} label="Show Next-Episode Notification" right={<GlassToggle checked={nextEpisodeNotification} onChange={setNextEpisodeNotification} />} />
        <SettingsRow
          icon={Cpu}
          label="Hardware-Accelerated Decoding"
          description="Uses your GPU for video decode and rendering. Changing this requires a restart to take effect."
          right={<GlassToggle checked={hardwareDecoding} onChange={handleHardwareDecodingChange} />}
        />
        {restartRequired && (
          <div className="glass-panel mt-2 flex items-center justify-between gap-4 rounded-2xl px-4 py-3">
            <div className="flex items-center gap-2 text-xs">
              <Cpu className="w-4 h-4 text-accent shrink-0" />
              <span>Restart required for hardware acceleration changes to take effect.</span>
            </div>
            <button
              onClick={handleRelaunch}
              disabled={isRelaunching}
              className="glass-interactive shrink-0 rounded-xl bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
            >
              {isRelaunching ? 'Restarting…' : 'Restart Now'}
            </button>
          </div>
        )}
        <SettingsRow icon={PauseCircle} label="Pause Playback When Minimized" right={<GlassToggle checked={pauseOnMinimize} onChange={setPauseOnMinimize} />} />
        <SettingsRow icon={AudioLines} label="Audio Normalization by Default" right={<GlassToggle checked={normalizeByDefault} onChange={setNormalizeByDefault} />} />
      </SettingsSection>


      <SettingsSection title="Audio" category="Playback">
        <SettingsRow
          icon={AudioLines}
          label="Surround Sound / Spatial Audio"
          description="Widens the soundstage on multi-channel sources using Web Audio spatialization"
          right={<GlassToggle checked={spatialAudio} onChange={handleSpatialAudioChange} />}
        />
      </SettingsSection>


      <SettingsSection title="Add-ons" category="Streaming & Add-ons">
        <SettingsRow
          icon={Puzzle}
          label="Manage Add-ons"
          description="Install add-ons for catalogs, streams, and subtitles from a single manifest URL"
          onClick={onOpenAddons}
          right={<ChevronRight className="w-4 h-4 text-neutral-400" />}
        />
      </SettingsSection>


      <SettingsSection title="Streaming" category="Streaming & Add-ons">
        <div className="p-2">
          <details className="group glass-clear rounded-xl border border-white/10 open:bg-white/5">
            <summary className="flex items-center justify-between cursor-pointer list-none px-4 py-3 select-none">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium">Advanced / Network</span>
                <span className="text-[11px] text-neutral-500 dark:text-neutral-400 hidden sm:inline">— Remote server & proxy for power users</span>
              </div>
              <ChevronDown className="w-4 h-4 text-neutral-400 transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <div className="px-2 pb-2">
              <StreamingSettings />
            </div>
          </details>
        </div>
        <SettingsRow
          icon={Gauge}
          label="Streaming HTTPS endpoint"
          description={streamingServerConnected ? 'Connected to local streaming server' : 'Saved locally; server unavailable'}
          right={
            <div className="glass-capsule px-3 py-1.5">
              <select
                value={streamingSettings.https ? 'enabled' : 'disabled'}
                onChange={(event) => updateStreamingSetting({ https: event.target.value === 'enabled' })}
                className="text-xs bg-transparent outline-none cursor-pointer"
              >
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
          }
        />
        <SettingsRow
          icon={Gauge}
          label="Torrent profile"
          right={
            <div className="glass-capsule px-3 py-1.5">
              <select
                value={streamingSettings.torrentProfile}
                onChange={(event) => updateStreamingSetting({ torrentProfile: event.target.value })}
                className="text-xs bg-transparent outline-none cursor-pointer"
              >
                <option value="default">Default</option>
                <option value="fast">Fast</option>
                <option value="ultra-fast">Ultra Fast</option>
              </select>
            </div>
          }
        />
        <SettingsRow
          icon={Gauge}
          label="Transcode profile"
          right={
            <div className="glass-capsule px-3 py-1.5">
              <select
                value={streamingSettings.transcodeProfile}
                onChange={(event) => updateStreamingSetting({ transcodeProfile: event.target.value })}
                className="text-xs bg-transparent outline-none cursor-pointer"
              >
                <option value="disabled">Disabled</option>
                <option value="automatic">Automatic</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          }
        />
        <SettingsRow icon={Database} label="Cache Size" description="Disk space reserved for buffering (acts as shock absorber for P2P jitter — 10 GB recommended for 4K)" right={
          <div className="glass-capsule px-3 py-1.5">
            <select value={cacheSize} onChange={(e) => { const v = e.target.value; setCacheSize(v); updateStreamingSetting({ cacheSize: v }) }} className="text-xs bg-transparent outline-none cursor-pointer">
              {CACHE_SIZE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.display}</option>
              ))}
            </select>
          </div>
        } />
        <SettingsRow
          icon={HardDrive}
          label="Streaming Server Health"
          description={
            serverHealth === 'checking' ? `Checking ${(() => { try { return getStreamingServerBaseUrl() } catch { return DEFAULT_STREAMING_SERVER_BASE } })()}...` :
            serverHealth === 'online' ? `Online at ${(() => { try { return getStreamingServerBaseUrl() } catch { return DEFAULT_STREAMING_SERVER_BASE } })()}${healthCheckedAt ? ` — checked ${new Date(healthCheckedAt).toLocaleTimeString()}` : ''}` :
            serverHealth === 'restarting' ? 'Restarting...' :
            `Offline — no response from ${(() => { try { return getStreamingServerBaseUrl() } catch { return DEFAULT_STREAMING_SERVER_BASE } })()}. Start the Stremio desktop app or configure a Remote Streaming URL above.`
          }
          right={
            serverHealth === 'online' ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Online
              </span>
            ) : serverHealth === 'checking' || serverHealth === 'restarting' ? (
              <span className="text-xs text-neutral-400">{serverHealth === 'checking' ? 'Checking…' : 'Restarting…'}</span>
            ) : (
              <button
                onClick={async () => {
                  setIsRestartingServer(true)
                  await restartAndRecheck()
                  setIsRestartingServer(false)
                }}
                disabled={isRestartingServer}
                className="px-3 py-1.5 rounded-full bg-accent text-white text-xs font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors"
              >
                Retry
              </button>
            )
          }
        />
      </SettingsSection>


      <SettingsSection title="Storage" category="General">
        <SettingsRow
          icon={HardDrive}
          label={storageInfo?.connected ? 'Streaming Server Cache' : 'Local App Storage'}
          description={
            storageInfo?.connected
              ? `Connected to local streaming server — ${storageInfo.cacheLabel} cached`
              : storageInfo
                ? `Local app data (${storageInfo.totalLabel})`
                : 'Checking...'
          }
        />
        <SettingsRow
          icon={Trash2}
          label="Purge Cache"
          description={
            storageInfo?.connected
              ? 'Clears cached streams from the local streaming server'
              : 'Clears saved watch history from this app (your login stays active)'
          }
          onClick={handlePurgeCache}
          right={
            <span className="text-xs font-medium text-accent">
              {isPurging ? 'Purging...' : 'Purge'}
            </span>
          }
        />
        {purgeMessage && (
          <div className="px-5 py-3 text-xs text-neutral-500 dark:text-neutral-400 bg-black/5 dark:bg-white/5">
            {purgeMessage}
          </div>
        )}
      </SettingsSection>

      <SettingsSection title="Cloud Sync" category="General">
        <SettingsRow
          icon={Globe}
          label={isCloudConfigured ? (cloudUser ? `Cloud: ${cloudUser.email || cloudUser.id}` : 'Cloud: Not signed in') : 'Cloud: Not configured'}
          description={
            !isCloudConfigured ? 'Supabase not configured' :
            isSyncing ? 'Syncing...' :
            lastSyncedAt ? `Last synced ${new Date(lastSyncedAt).toLocaleTimeString()}` :
            'No sync history'
          }
          right={
            isCloudConfigured && cloudUser ? (
              <button onClick={() => syncNow()} disabled={isSyncing} className="text-xs font-medium text-accent disabled:opacity-50">
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </button>
            ) : isCloudConfigured && !cloudUser ? (
              <button onClick={handleEnableCloud} disabled={isEnablingCloud || !user || cloudEnableCooldown > 0} className="text-xs font-medium text-accent disabled:opacity-50">
                {isEnablingCloud ? 'Enabling...' : cloudEnableCooldown > 0 ? `Wait ${cloudEnableCooldown}s` : 'Enable Cloud Sync'}
              </button>
            ) : null
          }
        />
        {cloudKeyMismatch && (
          <div className="px-5 py-3 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border-t border-black/5 dark:border-white/10">
            ⚠️ {cloudKeyMismatch}
          </div>
        )}
        {cloudEnableError && (
          <div className="px-5 py-3 text-xs text-red-600 dark:text-red-400 bg-red-500/10 border-t border-black/5 dark:border-white/10">
            Enable failed: {cloudEnableError}
          </div>
        )}
        {isCloudConfigured && cloudUser && (
          <div className="px-5 py-2 text-[11px] text-neutral-500 dark:text-neutral-400 bg-black/[0.02] dark:bg-white/[0.03] border-t border-black/5 dark:border-white/10">
            Profiles (global) + Continue Watching / Watched / Viewing Log (per-profile) sync every 30s + on change. Restart dev server after editing .env.
          </div>
        )}
      </SettingsSection>


      <SettingsSection title="Shortcuts" category="General">
        <div className="px-5 py-4 space-y-2.5">
          {SHORTCUTS.map((s) => (
            <div key={s.action} className="flex items-center justify-between text-sm">
              <span className="text-neutral-600 dark:text-neutral-300">{s.action}</span>
              <span className="font-mono text-xs px-2 py-1 rounded-lg bg-black/5 dark:bg-white/10 text-neutral-500 dark:text-neutral-400">
                {s.keys}
              </span>
            </div>
          ))}
        </div>
      </SettingsSection>


      <SettingsSection title="Info" category="General">
        <SettingsRow icon={Mail} label="Contact Support" onClick={() => alert('stremioplus.help@gmail.com')} right={<ChevronRight className="w-4 h-4 text-neutral-400" />} />
      </SettingsSection>
        </div>
      </div>
    </div>
    </SettingsFilterContext.Provider>
  )
}


export default SettingsPage